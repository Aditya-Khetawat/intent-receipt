import { describe, expect, it } from "vitest";
import { ALLOWED_ACTIONS, checkDecision, policyLines } from "@/lib/ai/policy";
import { CLASSIFICATIONS } from "@/lib/ai/schemas";
import { loadPrompt } from "@/lib/ai/prompts";
import { loadFixture } from "@/lib/disputes/analyze";
import { SCENARIOS } from "@/lib/disputes/scenarios";

describe("decision policy", () => {
  it("covers every classification, and the analyst prompt states the same table", () => {
    expect(Object.keys(ALLOWED_ACTIONS).sort()).toEqual([...CLASSIFICATIONS].sort());
    const prompt = loadPrompt("dispute-analyst").text;
    for (const line of policyLines()) expect(prompt).toContain(line);
  });

  it("accepts consistent pairs", () => {
    expect(
      checkDecision({ classification: "ITEM_NOT_RECEIVED", agent_fault: "NONE", recommended_seller_action: "ACCEPT_AND_REFUND" }),
    ).toEqual([]);
    expect(checkDecision({ classification: "BUYER_CHANGED_MIND", agent_fault: "NONE", recommended_seller_action: "CONTEST" })).toEqual([]);
    expect(
      checkDecision({ classification: "AGENT_MISINTERPRETATION", agent_fault: "LIKELY", recommended_seller_action: "ACCEPT_AND_REFUND" }),
    ).toEqual([]);
  });

  it("names the contradictions seen in the live eval", () => {
    expect(checkDecision({ classification: "ITEM_NOT_RECEIVED", agent_fault: "NONE", recommended_seller_action: "CONTEST" })).toEqual([
      "ITEM_NOT_RECEIVED allows ACCEPT_AND_REFUND, but the action is CONTEST",
    ]);
    expect(
      checkDecision({ classification: "BUYER_CHANGED_MIND", agent_fault: "NONE", recommended_seller_action: "OFFER_PARTIAL" }),
    ).toHaveLength(1);
  });

  it("checks agent_fault against the classification and action", () => {
    expect(
      checkDecision({ classification: "AGENT_MISINTERPRETATION", agent_fault: "NONE", recommended_seller_action: "ACCEPT_AND_REFUND" }),
    ).toHaveLength(1);
    expect(
      checkDecision({ classification: "BUYER_CHANGED_MIND", agent_fault: "LIKELY", recommended_seller_action: "CONTEST" }),
    ).toHaveLength(2);
  });

  it("every cached fixture is consistent", () => {
    for (const s of SCENARIOS) expect({ s: s.key, issues: checkDecision(loadFixture(s.key)!.output) }).toEqual({ s: s.key, issues: [] });
  });
});
