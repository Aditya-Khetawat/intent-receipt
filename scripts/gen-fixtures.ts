import "./_env";
import fs from "node:fs";
import path from "node:path";
import { resetTestDb } from "../src/lib/db";
import { aiStatus } from "../src/lib/ai/provider";
import { simulateScenarioDispute } from "../src/lib/disputes/simulate";
import { buildDisputeContext } from "../src/lib/disputes/context";
import { runAnalyst } from "../src/lib/disputes/analyze";
import { SCENARIOS } from "../src/lib/disputes/scenarios";
import { env } from "../src/lib/env";

// `npm run gen-fixtures`: regenerate db/fixtures/analyses/S*.json from a REAL model
// run (the CACHED fallback). Only fixtures whose citations all verify are written.

async function main() {
  if (!aiStatus().available) throw new Error(`AI unavailable: ${aiStatus().reason}`);
  process.env.DATABASE_PATH = ":memory:";
  resetTestDb();
  for (const s of SCENARIOS) {
    const id = (await simulateScenarioDispute(s.key))!;
    const ctx = buildDisputeContext(id);
    const { output, validation } = await runAnalyst(ctx);
    const verifiedIds = new Set(validation.items.filter((i) => i.ok).map((i) => i.id));
    const kept = { ...output, evidence: output.evidence.filter((e) => verifiedIds.has(e.id)) };
    console.log(`${s.key}: ${output.classification} / ${output.recommended_seller_action} · ${validation.verified}/${validation.verified + validation.failed} verified`);
    if (!kept.evidence.length) {
      console.log(`  skipped ${s.key}: no verified evidence`);
      continue;
    }
    const file = path.join("db", "fixtures", "analyses", `${s.key}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify({ generated_at: new Date().toISOString(), origin: `live run of ${env.aiProvider}/${env.aiModelAnalyst}`, model: env.aiModelAnalyst, scenario: s.key, output: kept }, null, 2) + "\n",
    );
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
