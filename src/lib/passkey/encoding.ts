import { canonicalize } from "@/lib/ledger/canonical";

// Browser-safe. The confirm challenge is derived from fields stored in the signed record,
// so anyone holding a receipt can recompute what the buyer's passkey signed.

export const PASSKEY_SCHEME = "webauthn-confirm/1";

/** The WebAuthn assertion behind a passkey confirmation, kept verbatim so it can be re-checked. */
export interface PasskeyProof {
  scheme: typeof PASSKEY_SCHEME;
  rp_id: string;
  origin: string;
  credential_id: string;
  public_key_jwk: JsonWebKey;
  /** COSE algorithm: -7 ES256, -8 EdDSA, -257 RS256. */
  alg: number;
  nonce: string;
  authenticator_data: string;
  client_data_json: string;
  signature: string;
  user_verified: boolean;
}

export const toB64u = (bytes: ArrayBuffer | Uint8Array) => {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const fromB64u = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

/** SHA-256 of canonical({ scheme, intent_id, presented_text_sha256, nonce }), the bytes the passkey is asked to sign. */
export async function confirmChallengeBytes(
  input: { intent_id: string; presented_text_sha256: string; nonce: string },
  subtle: SubtleCrypto = crypto.subtle,
): Promise<Uint8Array<ArrayBuffer>> {
  const data = new TextEncoder().encode(canonicalize({ scheme: PASSKEY_SCHEME, ...input }));
  return new Uint8Array(await subtle.digest("SHA-256", data));
}
