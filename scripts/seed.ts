import "./_env";
import { rawDb } from "../src/lib/db";
import { resetDemoData } from "../src/lib/seed";
import { verifyLedger } from "../src/lib/ledger";

// `npm run seed`: wipe demo data and re-seed the S1-S4 history (same as "Reset demo data").
const db = rawDb();
resetDemoData(db);
const v = verifyLedger();
console.log(`Seeded. Ledger: ${v.count} entries, ${v.ok ? "chain intact" : `BROKEN at seq ${v.first_bad_seq}`}.`);
