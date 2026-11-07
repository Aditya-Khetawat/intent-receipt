import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

interface KeyPair {
  keyId: string;
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  /** True when the key was auto-generated for local development. */
  ephemeral: boolean;
}

const g = globalThis as unknown as { __irKey?: KeyPair };

export function generateKeyPairB64(): { privatePkcs8B64: string; publicSpkiB64: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  return {
    privatePkcs8B64: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
    publicSpkiB64: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  };
}

function devKeyFile(): string {
  return path.join(path.dirname(path.resolve(env.databasePath)), "dev-signing-key.txt");
}

/**
 * Loads the Ed25519 signing key from INTENT_SIGNING_KEY (PKCS8 DER, base64).
 * Outside production, falls back to a locally persisted dev key so a fresh clone
 * runs without setup. Production refuses to start without a configured key.
 */
export function signingKey(): KeyPair {
  if (g.__irKey) return g.__irKey;
  let b64 = env.signingKey;
  let ephemeral = false;
  if (!b64) {
    if (env.nodeEnv === "production") {
      throw new Error("INTENT_SIGNING_KEY is required in production. Run `npm run gen-keys`.");
    }
    ephemeral = true;
    const file = devKeyFile();
    if (process.env.DATABASE_PATH === ":memory:") {
      b64 = generateKeyPairB64().privatePkcs8B64;
    } else if (fs.existsSync(file)) {
      b64 = fs.readFileSync(file, "utf8").trim();
    } else {
      b64 = generateKeyPairB64().privatePkcs8B64;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, b64);
      console.warn(`[intentreceipt] No INTENT_SIGNING_KEY set; generated a dev key at ${file}`);
    }
  }
  const privateKey = crypto.createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" });
  const publicKey = crypto.createPublicKey(privateKey);
  g.__irKey = { keyId: env.keyId, privateKey, publicKey, ephemeral };
  return g.__irKey;
}

export function publicKeyDocument() {
  const k = signingKey();
  const jwk = k.publicKey.export({ format: "jwk" }) as { kty: string; crv: string; x: string };
  return {
    key_id: k.keyId,
    algorithm: "Ed25519",
    signs: "SHA-256 digest bytes of canonical_json({seq,type,intent_id,payload,prev_hash})",
    jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x },
    spki_b64: k.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    dev_key: k.ephemeral,
  };
}
