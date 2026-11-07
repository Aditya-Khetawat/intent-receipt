import "../scripts/_env";
import { resetTestDb } from "../src/lib/db";
import { aiStatus } from "../src/lib/ai/provider";
import { simulateScenarioDispute } from "../src/lib/disputes/simulate";
import { buildDisputeContext } from "../src/lib/disputes/context";
import { runAnalyst } from "../src/lib/disputes/analyze";
import { SCENARIOS } from "../src/lib/disputes/scenarios";
import { env } from "../src/lib/env";

// `npm run ai-eval [runs]`: runs S1-S4 N times (default 5) against the configured
// runtime model and prints an honest table. Uses ~N*4 to N*8 model calls.

async function main() {
  if (!aiStatus().available) throw new Error(`AI unavailable: ${aiStatus().reason}`);
  const runs = Number(process.argv[2] ?? 5);
  process.env.DATABASE_PATH = ":memory:";
  resetTestDb();
  console.log(`Model: ${env.aiProvider}/${env.aiModelAnalyst} · ${runs} runs per scenario · ${new Date().toISOString()}\n`);
  console.log("| Scenario | Expected action | Expected action hit | Classification hit | Verified ratio (after validation) | Raw citation pass rate |");
  console.log("|---|---|---|---|---|---|");
  for (const s of SCENARIOS) {
    const id = (await simulateScenarioDispute(s.key))!;
    const ctx = buildDisputeContext(id);
    let actionHit = 0;
    let classHit = 0;
    let verified = 0;
    let shown = 0;
    let raw = 0;
    for (let i = 0; i < runs; i++) {
      try {
        const { output, validation } = await runAnalyst(ctx);
        if (output.recommended_seller_action === s.expected.action) actionHit++;
        if (output.classification === s.expected.classification) classHit++;
        verified += validation.verified;
        shown += validation.verified; // only verified items are ever shown
        raw += validation.verified + validation.failed;
      } catch (e) {
        console.error(`  ${s.key} run ${i + 1} failed: ${(e as Error).message}`);
      }
    }
    console.log(
      `| ${s.key} | ${s.expected.action} | ${actionHit}/${runs} | ${classHit}/${runs} | ${shown ? Math.round((verified / shown) * 100) : 0}% | ${raw ? Math.round((verified / raw) * 100) : 0}% |`,
    );
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
