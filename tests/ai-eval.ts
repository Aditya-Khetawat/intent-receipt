import "../scripts/_env";
import { resetTestDb } from "../src/lib/db";
import { aiStatus } from "../src/lib/ai/provider";
import { simulateScenarioDispute } from "../src/lib/disputes/simulate";
import { buildDisputeContext } from "../src/lib/disputes/context";
import { runAnalyst } from "../src/lib/disputes/analyze";
import { SCENARIOS } from "../src/lib/disputes/scenarios";
import { env } from "../src/lib/env";

// `npm run ai-eval [runs] [S1,S4]`: runs the scenarios (default all) N times (default 5) against the
// configured runtime model and prints an honest table. Uses ~N to 2N model calls per scenario.

async function main() {
  if (!aiStatus().available) throw new Error(`AI unavailable: ${aiStatus().reason}`);
  const runs = Number(process.argv[2] ?? 5);
  const only = process.argv[3]?.split(",");
  process.env.DATABASE_PATH = ":memory:";
  process.env.SKIP_AUTO_ANALYSIS = "1";
  resetTestDb();
  console.log(`Model: ${env.aiProvider}/${env.aiModelAnalyst} · ${runs} runs per scenario · ${new Date().toISOString()}\n`);
  console.log("| Scenario | Expected action | Expected action hit | Classification hit | Self-consistent | Return offered | Verified ratio (after validation) | Raw citation pass rate |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const s of SCENARIOS.filter((x) => !only || only.includes(x.key))) {
    const id = (await simulateScenarioDispute(s.key))!;
    const ctx = buildDisputeContext(id);
    let actionHit = 0;
    let classHit = 0;
    let consistent = 0;
    let returnOffered = 0;
    let verified = 0;
    let shown = 0;
    let raw = 0;
    for (let i = 0; i < runs; i++) {
      try {
        const { output, validation } = await runAnalyst(ctx);
        if (output.recommended_seller_action === s.expected.action) actionHit++;
        else console.error(`  ${s.key} run ${i + 1} chose ${output.recommended_seller_action} (${output.classification})`);
        if (output.classification === s.expected.classification) classHit++;
        if (!validation.decision_conflicts?.length) consistent++;
        if (/return/i.test(output.buyer_message_draft)) returnOffered++;
        else console.error(`  ${s.key} run ${i + 1} still contradicts itself: ${validation.decision_conflicts?.join("; ")}`);
        verified += validation.verified;
        shown += validation.verified; // only verified items are ever shown
        raw += validation.verified + validation.failed;
      } catch (e) {
        console.error(`  ${s.key} run ${i + 1} failed: ${(e as Error).message}`);
      }
    }
    console.log(
      `| ${s.key} | ${s.expected.action} | ${actionHit}/${runs} | ${classHit}/${runs} | ${consistent}/${runs} | ${s.expected.classification === "BUYER_CHANGED_MIND" ? `${returnOffered}/${runs}` : "n/a"} | ${shown ? Math.round((verified / shown) * 100) : 0}% | ${raw ? Math.round((verified / raw) * 100) : 0}% |`,
    );
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
