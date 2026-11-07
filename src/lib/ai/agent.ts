import { tool, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";
import { ulid } from "ulid";
import { getDb, nowIso } from "@/lib/db";
import { env } from "@/lib/env";
import { getProduct, searchCatalog } from "@/lib/catalog";
import { CONSTRAINT_KEYS, type Constraint } from "@/lib/catalog/constraints";
import { createDraftIntent, IntentError, type IntentRow } from "@/lib/intents";
import { toolkitGetOrder } from "@/lib/paypal/toolkit";
import { aiStatus, runAgentTurn } from "./provider";
import { loadPrompt } from "./prompts";

export const MAX_MESSAGES_PER_SESSION = 24;
const NUMERIC_KEYS = new Set(["max_price", "min_price", "capacity_liters", "length_m", "quantity"]);

const DEFAULT_BUYER = { id: "buyer_demo_1", display_name: "Maya Rao" };

export function ensureSession(sessionId: string | null): string {
  const db = getDb();
  if (sessionId && db.prepare("SELECT 1 FROM agent_sessions WHERE id = ?").get(sessionId)) return sessionId;
  const id = `ses_${ulid()}`;
  db.prepare("INSERT INTO agent_sessions (id, buyer_id, created_at) VALUES (?, ?, ?)").run(id, DEFAULT_BUYER.id, nowIso());
  return id;
}

interface MsgRow {
  role: "user" | "agent";
  content: string;
  created_at: string;
}

export function sessionMessages(sessionId: string): MsgRow[] {
  return getDb()
    .prepare("SELECT role, content, created_at FROM agent_messages WHERE session_id = ? ORDER BY created_at, rowid")
    .all(sessionId) as MsgRow[];
}

function saveMessage(sessionId: string, role: "user" | "agent", content: string, toolCalls?: unknown) {
  getDb()
    .prepare("INSERT INTO agent_messages (id, session_id, role, content, tool_calls_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(`msg_${ulid()}`, sessionId, role, content, toolCalls ? JSON.stringify(toolCalls) : null, nowIso());
}

export function normalizeConstraints(raw: { key: string; value: string | number }[]): Constraint[] {
  return raw
    .filter((c) => (CONSTRAINT_KEYS as readonly string[]).includes(c.key))
    .map((c) => {
      let value: string | number = c.value;
      if (NUMERIC_KEYS.has(c.key)) {
        const n = parseFloat(String(c.value).replace(/[^0-9.\-]/g, ""));
        if (Number.isFinite(n)) value = n;
      }
      return { key: c.key as Constraint["key"], value, source_turn: 0, confidence: 0.9 };
    });
}

function buildTools(sessionId: string, turns: () => MsgRow[], onProposal: (i: IntentRow) => void, promptVersion: string): ToolSet {
  const tools: ToolSet = {
    search_catalog: tool({
      description: "Search the Fernhill Outfitters catalog. Returns products with every variant, price, stock and delivery estimate.",
      inputSchema: z.object({
        query: z.string().describe("keywords, e.g. 'waterproof backpack 40L black'"),
        category: z.string().optional().describe("optional category filter, e.g. 'backpack', 'cable'"),
      }),
      execute: async ({ query, category }) => searchCatalog(query, { category }),
    }),
    get_product: tool({
      description: "Get one product with all its variants.",
      inputSchema: z.object({ product_id: z.string() }),
      execute: async ({ product_id }) => getProduct(product_id) ?? { error: "unknown product_id" },
    }),
    propose_selection: tool({
      description:
        "Propose ONE item to the buyer. The server builds a draft intent record and runs a deterministic constraint check; the buyer then sees a confirmation card.",
      inputSchema: z.object({
        product_id: z.string(),
        variant_id: z.string(),
        quantity: z.number().int().min(1).max(10),
        rationale: z.string().describe("one sentence: why this option"),
        extracted_constraints: z
          .array(z.object({ key: z.enum(CONSTRAINT_KEYS), value: z.string().describe("the value, e.g. '85', 'black', '40L'") }))
          .describe("constraints the buyer stated"),
        assumptions: z.array(z.string()).describe("assumptions you made, may be empty"),
      }),
      execute: async (input) => {
        try {
          const history = turns();
          const intent = createDraftIntent({
            sessionId,
            buyer: DEFAULT_BUYER,
            agent: {
              name: "IntentReceipt Shopping Agent",
              provider: env.aiProvider,
              model: env.aiModelAgent,
              prompt_version: promptVersion,
            },
            turns: history.map((m) => ({ role: m.role, text: m.content, at: m.created_at })),
            product_id: input.product_id,
            variant_id: input.variant_id,
            quantity: input.quantity,
            rationale: input.rationale,
            extracted_constraints: normalizeConstraints(input.extracted_constraints),
            assumptions: input.assumptions,
          });
          onProposal(intent);
          return { intent_id: intent.id, constraint_check: intent.record.constraint_check.results };
        } catch (e) {
          return { error: e instanceof IntentError ? e.message : "could not create proposal" };
        }
      },
    }),
  };
  if (env.paypalConfigured) {
    tools.check_order_status = tool({
      description: "Look up a PayPal order's status (PayPal Agent Toolkit get_order).",
      inputSchema: z.object({ paypal_order_id: z.string() }),
      execute: async ({ paypal_order_id }) => {
        try {
          const o = (await toolkitGetOrder(paypal_order_id)) as { id?: string; status?: string };
          return { id: o.id, status: o.status };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    });
  }
  return tools;
}

export interface AgentReply {
  sessionId: string;
  reply: string;
  intentId: string | null;
}

export async function agentTurn(sessionIdIn: string | null, userText: string): Promise<AgentReply> {
  const status = aiStatus();
  if (!status.available) throw new Error(`AI_UNAVAILABLE: ${status.reason}`);
  const sessionId = ensureSession(sessionIdIn);
  const prior = sessionMessages(sessionId);
  if (prior.length >= MAX_MESSAGES_PER_SESSION) {
    return { sessionId, reply: "This demo conversation is at its message limit. Start a new chat to keep shopping.", intentId: null };
  }
  const text = userText.slice(0, 600);
  saveMessage(sessionId, "user", text);
  const prompt = loadPrompt("shop-agent");
  let proposal: IntentRow | null = null;
  const tools = buildTools(sessionId, () => sessionMessages(sessionId), (i) => (proposal = i), prompt.version);
  const messages: ModelMessage[] = sessionMessages(sessionId).map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));
  const system = `${prompt.text}\n\nToday's date: ${new Date().toISOString().slice(0, 10)}.`;
  const result = await runAgentTurn({ system, messages, tools });
  const p = proposal as IntentRow | null;
  const reply =
    result.text.trim() ||
    (p ? `I found an option for you: ${p.record.selection.product_name}. Please review the confirmation card.` : "Sorry, I could not find a good match. Could you rephrase?");
  saveMessage(sessionId, "agent", reply, result.toolCalls.map((t) => ({ name: t.name, input: t.input })));
  return { sessionId, reply, intentId: p?.id ?? null };
}
