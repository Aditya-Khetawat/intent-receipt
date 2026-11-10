import type { IntentRecord } from "@/lib/intents";
import { confirmChallengeBytes, fromB64u, PASSKEY_SCHEME, toB64u } from "./encoding";

// Browser-safe re-check of a passkey confirmation (WebAuthn assertion) from the record alone:
// the challenge is recomputed from the card hash, then the signature is checked with Web Crypto.

export const PASSKEY_ALG_NAME: Record<number, string> = { [-7]: "ES256", [-8]: "EdDSA", [-257]: "RS256" };

const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** ECDSA signatures arrive DER-encoded; Web Crypto wants raw r‖s. */
function derToRaw(der: Uint8Array, size = 32): Uint8Array<ArrayBuffer> {
  if (der[0] !== 0x30) throw new Error("bad DER");
  let i = 2;
  const int = () => {
    if (der[i] !== 0x02) throw new Error("bad DER");
    const len = der[i + 1];
    let v = der.slice(i + 2, i + 2 + len);
    i += 2 + len;
    while (v.length > size && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(size);
    out.set(v, size - v.length);
    return out;
  };
  const r = int();
  const s = int();
  const raw = new Uint8Array(size * 2);
  raw.set(r);
  raw.set(s, size);
  return raw;
}

async function importKey(
  subtle: SubtleCrypto,
  jwk: JsonWebKey,
  alg: number,
): Promise<{ key: CryptoKey; params: AlgorithmIdentifier | EcdsaParams } | null> {
  try {
    if (alg === -7)
      return {
        key: await subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]),
        params: { name: "ECDSA", hash: "SHA-256" },
      };
    if (alg === -257)
      return {
        key: await subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]),
        params: { name: "RSASSA-PKCS1-v1_5" },
      };
    if (alg === -8) return { key: await subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["verify"]), params: { name: "Ed25519" } };
  } catch {
    return null;
  }
  return null;
}

/** ok: true signed by the recorded passkey, false altered or invalid, null no passkey (or not checkable here). */
export async function verifyPasskeyProof(
  record: IntentRecord,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<{ ok: boolean | null; detail: string }> {
  const c = record.confirmation;
  if (!c) return { ok: null, detail: "Not confirmed yet." };
  if (c.method !== "passkey") return { ok: null, detail: "Confirmed with a button press, without a passkey." };
  const p = c.passkey;
  const fail = (detail: string) => ({ ok: false, detail });
  if (!p || p.scheme !== PASSKEY_SCHEME) return fail("Marked as a passkey confirmation but carries no passkey proof.");
  try {
    const clientDataBytes = fromB64u(p.client_data_json);
    const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes)) as { type?: string; challenge?: string; origin?: string };
    if (clientData.type !== "webauthn.get") return fail("The passkey response is not a sign-in assertion.");
    const expected = toB64u(
      await confirmChallengeBytes({ intent_id: record.id, presented_text_sha256: c.presented_text_sha256, nonce: p.nonce }, subtle),
    );
    if (clientData.challenge !== expected) return fail("The passkey signed a different challenge than this card's hash.");
    const host = new URL(p.origin).hostname;
    if (clientData.origin !== p.origin || (host !== p.rp_id && !host.endsWith(`.${p.rp_id}`)))
      return fail("The passkey was used on a different site.");

    const authData = fromB64u(p.authenticator_data);
    if (authData.length < 37) return fail("The authenticator data is truncated.");
    const rpIdHash = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(p.rp_id)));
    if (!eq(authData.slice(0, 32), rpIdHash)) return fail(`The passkey belongs to another site than ${p.rp_id}.`);
    const flags = authData[32];
    if (!(flags & 0x01)) return fail("The authenticator did not record the buyer's presence.");
    if (Boolean(flags & 0x04) !== p.user_verified) return fail("The user-verified flag does not match the authenticator data.");

    const k = await importKey(subtle, p.public_key_jwk, p.alg);
    if (!k) return { ok: null, detail: `This browser cannot check ${PASSKEY_ALG_NAME[p.alg] ?? `algorithm ${p.alg}`} passkey signatures.` };
    const clientDataHash = new Uint8Array(await subtle.digest("SHA-256", clientDataBytes));
    const signed = new Uint8Array(authData.length + clientDataHash.length);
    signed.set(authData);
    signed.set(clientDataHash, authData.length);
    const sig = fromB64u(p.signature);
    const ok = await subtle.verify(k.params, k.key, p.alg === -7 ? derToRaw(sig) : sig, signed);
    if (!ok) return fail("The passkey signature is invalid.");
    return {
      ok: true,
      detail: `Signed by passkey ${p.credential_id.slice(0, 10)}… (${PASSKEY_ALG_NAME[p.alg]}) over this card's hash${p.user_verified ? ", with the buyer verified on their device" : ""}.`,
    };
  } catch {
    return fail("The passkey proof is malformed.");
  }
}
