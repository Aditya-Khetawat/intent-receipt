import { generateKeyPairB64 } from "../src/lib/ledger/keys";

// Prints a fresh Ed25519 signing key. Put INTENT_SIGNING_KEY in .env (local) or the
// Render dashboard (production). Never commit it.
const k = generateKeyPairB64();
console.log("Add these to your environment (keep the private key secret):\n");
console.log(`INTENT_SIGNING_KEY=${k.privatePkcs8B64}`);
console.log(`INTENT_KEY_ID=ir-key-${new Date().toISOString().slice(0, 10)}`);
console.log(`\n# public key (SPKI, base64), also served at /.well-known/intent-receipt-key.json:\n# ${k.publicSpkiB64}`);
