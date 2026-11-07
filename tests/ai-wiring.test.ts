import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { resetTestDb } from "@/lib/db";
import { setTestModel } from "@/lib/ai/provider";
import { agentTurn } from "@/lib/ai/agent";
import { getIntent } from "@/lib/intents";
import { simulateScenarioDispute } from "@/lib/disputes/simulate";
import { loadFixture } from "@/lib/disputes/analyze";
import { latestAnalysis } from "@/lib/disputes/store";

// Exercises the real AI SDK v7 code paths (tool loop, structured output) with a
// mock model, so wiring is verified without an API key.

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};
const toolCall = (id: string, name: string, input: unknown) => ({
  content: [{ type: "tool-call" as const, toolCallId: id, toolName: name, input: JSON.stringify(input) }],
  finishReason: { unified: "tool-calls" as const, raw: undefined },
  usage,
  warnings: [],
});
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] });

describe("AI wiring with a mock model", () => {
  beforeEach(() => {
    resetTestDb();
  });
  afterEach(() => setTestModel(null));

  it("agent: search -> propose_selection creates a draft intent with deterministic checks", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        toolCall("c1", "search_catalog", { query: "waterproof backpack 40L black" }),
        toolCall("c2", "propose_selection", {
          product_id: "p_ridge_pack",
          variant_id: "v_ridge_40_black",
          quantity: 1,
          rationale: "Meets every requirement.",
          extracted_constraints: [
            { key: "capacity_liters", value: "40" },
            { key: "color", value: "black" },
            { key: "max_price", value: "$85" },
          ],
          assumptions: [],
        }),
        text("I picked the Brightpine Ridge Pack 40L in black for $79."),
      ],
    });
    setTestModel(model);
    const r = await agentTurn(null, "I need a waterproof 40L backpack in black, under $85");
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(r.reply).toMatch(/Ridge Pack/);
    const intent = getIntent(r.intentId!)!;
    expect(intent.status).toBe("DRAFT");
    expect(intent.record.request.verbatim).toBe("I need a waterproof 40L backpack in black, under $85");
    expect(intent.record.extracted_constraints.find((c) => c.key === "max_price")?.value).toBe(85);
    expect(intent.record.constraint_check.results.map((x) => x.status)).toEqual(["MET", "MET", "MET"]);
  });

  it("analyst: structured output is parsed, validated and stored as live (not cached)", async () => {
    const out = loadFixture("S2")!.output;
    setTestModel(new MockLanguageModelV4({ doGenerate: async () => text(JSON.stringify(out)) }));
    // Ingest auto-enqueues the analysis; wait for it.
    const id = (await simulateScenarioDispute("S2"))!;
    for (let i = 0; i < 50 && !latestAnalysis(id); i++) await new Promise((r) => setTimeout(r, 20));
    const a = latestAnalysis(id)!;
    expect(a.cache_origin).toBeNull();
    expect(a.cached).toBe(false);
    expect(a.output.recommended_seller_action).toBe("ACCEPT_AND_REFUND");
    expect(a.validation).toMatchObject({ verified: out.evidence.length, failed: 0 });
  });
});
