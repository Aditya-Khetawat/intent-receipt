import "./_env";
import { rawDb } from "../src/lib/db";
import { resetDemoData } from "../src/lib/seed";
import { verifyLedger } from "../src/lib/ledger";

// `npm run seed`: same as "Reset demo data" (simulated disputes, drafts and chats only).
// `npm run seed -- --all`: wipe EVERYTHING, including real sandbox orders and the ledger.
const full = process.argv.includes("--all");
const db = rawDb();
resetDemoData(db, { full });
const v = verifyLedger();
console.log(`${full ? "Wiped and re-seeded" : "Demo state reset"}. Ledger: ${v.count} entries, ${v.ok ? "chain intact" : `BROKEN at seq ${v.first_bad_seq}`}.`);
