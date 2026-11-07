import { generateText, Output, isStepCount, type LanguageModel, type ToolSet, type ModelMessage } from "ai";
import { createGoogle } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";
import { ulid } from "ulid";
import type { z } from "zod";
import { env } from "@/lib/env";
import { getDb, nowIso } from "@/lib/db";

// The ONLY module that knows about specific AI providers (§10.0).
// Switch providers with AI_PROVIDER + AI_MODEL_* env vars; no code changes.

export type AiKind = "agent" | "analyst";

export class AiUnavailableError extends Error {
  constructor(
    message: string,
    public code: "NO_KEY" | "BUDGET" | "RATE_LIMIT" | "FAILED",
  ) {
    super(message);
  }
}

function apiKey(): string {
  switch (env.aiProvider) {
    case "google":
      return process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "";
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY ?? "";
    case "groq":
      return process.env.GROQ_API_KEY ?? "";
    default:
      return "";
  }
}

// Test seam: lets tests run the real agent/analyst code against a mock model.
let testModel: LanguageModel | null = null;
export function setTestModel(m: LanguageModel | null) {
  testModel = m;
}

export function aiStatus(): { available: boolean; provider: string; agentModel: string; analystModel: string; reason?: string } {
  const base = { provider: env.aiProvider, agentModel: env.aiModelAgent, analystModel: env.aiModelAnalyst };
  if (testModel) return { ...base, available: true };
  if (!["google", "anthropic", "groq"].includes(env.aiProvider)) {
    return { ...base, available: false, reason: `Unsupported AI_PROVIDER "${env.aiProvider}"` };
  }
  if (!apiKey()) return { ...base, available: false, reason: `No API key for provider "${env.aiProvider}"` };
  return { ...base, available: true };
}

export function modelId(kind: AiKind): string {
  return kind === "agent" ? env.aiModelAgent : env.aiModelAnalyst;
}

function model(kind: AiKind): LanguageModel {
  if (testModel) return testModel;
  const id = modelId(kind);
  switch (env.aiProvider) {
    case "anthropic":
      return createAnthropic({ apiKey: apiKey() })(id);
    case "groq":
      return createGroq({ apiKey: apiKey() })(id);
    case "google":
    default:
      return createGoogle({ apiKey: apiKey() })(id);
  }
}

// ---- Budget, usage and a tiny concurrency queue (free tiers are small) ----

export function callsToday(): number {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  return (getDb().prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE created_at >= ?").get(since.toISOString()) as { n: number }).n;
}

function checkReady(): void {
  const s = aiStatus();
  if (!s.available) throw new AiUnavailableError(s.reason ?? "AI unavailable", "NO_KEY");
  if (callsToday() >= env.aiDailyBudgetCalls) {
    throw new AiUnavailableError("The demo's daily AI budget is used up. The guided demo still works with cached analyses.", "BUDGET");
  }
}

function recordUsage(kind: string, usage: { inputTokens?: number; outputTokens?: number } | undefined, kindModel: AiKind) {
  getDb()
    .prepare("INSERT INTO ai_usage (id, kind, model, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(`use_${ulid()}`, kind, modelId(kindModel), usage?.inputTokens ?? null, usage?.outputTokens ?? null, nowIso());
}

// Groq's free tier is 8K tokens/minute, so parallel calls only starve each other.
const maxConcurrent = () => (env.aiProvider === "groq" ? 1 : 2);
let active = 0;
const waiting: (() => void)[] = [];

async function queued<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= maxConcurrent()) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

function isRateLimit(e: unknown): boolean {
  const err = e as { statusCode?: number; status?: number; message?: string };
  return err?.statusCode === 429 || err?.status === 429 || /429|rate limit|quota|RESOURCE_EXHAUSTED/i.test(err?.message ?? "");
}

// Free tiers are tokens-per-minute bound (Groq: 8K TPM), so honour the provider's
// retry-after when it is short enough to wait for; otherwise fail fast.
const MAX_WAIT_MS = 30_000;
function retryAfterMs(e: unknown): number | null {
  const h = (e as { responseHeaders?: Record<string, string> })?.responseHeaders?.["retry-after"];
  const s = h === undefined ? NaN : Number(h);
  return Number.isFinite(s) ? Math.ceil(s * 1000) + 250 : null;
}

async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [1500, 4000, 8000];
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const wait = retryAfterMs(e) ?? delays[i];
      if (i < delays.length && isRateLimit(e) && wait <= MAX_WAIT_MS) {
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (isRateLimit(e)) throw new AiUnavailableError("The AI provider is rate limiting requests. Try again in a minute.", "RATE_LIMIT");
      throw e;
    }
  }
}

// ---- Public interface ----

export interface AgentTurnResult {
  text: string;
  toolCalls: { name: string; input: unknown; output: unknown }[];
}

/** One agent turn with tool calling (max 8 tool steps). */
export async function runAgentTurn(opts: { system: string; messages: ModelMessage[]; tools: ToolSet }): Promise<AgentTurnResult> {
  checkReady();
  return queued(() =>
    withBackoff(async () => {
      const result = await generateText({
        model: model("agent"),
        system: opts.system,
        messages: opts.messages,
        tools: opts.tools,
        stopWhen: isStepCount(8),
        providerOptions: { groq: { reasoningEffort: "low" } },
        temperature: 0.2,
        maxOutputTokens: 1200,
        maxRetries: 0,
        timeout: 45_000,
      });
      recordUsage("agent", result.usage, "agent");
      const toolCalls = result.steps.flatMap((s) =>
        s.toolResults.map((tr) => ({ name: tr.toolName, input: tr.input, output: tr.output })),
      );
      return { text: result.text, toolCalls };
    }),
  );
}

/** JSON output validated by a zod schema. */
export async function generateStructured<S extends z.ZodTypeAny>(opts: {
  schema: S;
  system: string;
  prompt: string;
  kind?: AiKind;
}): Promise<z.infer<S>> {
  checkReady();
  const kind = opts.kind ?? "analyst";
  return queued(() =>
    withBackoff(async () => {
      const result = await generateText({
        model: model(kind),
        system: opts.system,
        prompt: opts.prompt,
        output: Output.object({ schema: opts.schema }),
        // Groq's strict mode rejects min/max keywords; zod still validates the result.
        providerOptions: { groq: { strictJsonSchema: false, reasoningEffort: "low" } },
        temperature: 0.1,
        maxOutputTokens: 4000,
        maxRetries: 0,
        timeout: 55_000,
      });
      recordUsage(kind, result.usage, kind);
      return result.output as z.infer<S>;
    }),
  );
}
