import crypto from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { cose, decodeCredentialPublicKey } from "@simplewebauthn/server/helpers";
import { getDb, nowIso } from "@/lib/db";
import { env } from "@/lib/env";
import { sha256Hex } from "@/lib/ledger";
import { cardText, confirmationCard, getIntent } from "@/lib/intents";
import { confirmChallengeBytes, fromB64u, PASSKEY_SCHEME, toB64u, type PasskeyProof } from "./encoding";

// Passkey (WebAuthn) registration and signed confirmation. The library checks each response;
// this module decides what is signed (the card's hash) and keeps every challenge single-use.

export class PasskeyError extends Error {
  status = 400;
}

const CHALLENGE_TTL_MS = 5 * 60_000;
// ES256, EdDSA, RS256: the algorithms Web Crypto can re-check in a browser.
const ALGS = [-7, -8, -257];

function relyingParty() {
  const u = new URL(env.appBaseUrl);
  return { rpID: u.hostname, origin: u.origin };
}

interface CredentialRow {
  id: string;
  public_key_cose: string;
  public_key_jwk: string;
  alg: number;
  counter: number;
}

const sessionCredentials = (sessionId: string) =>
  getDb()
    .prepare("SELECT id, public_key_cose, public_key_jwk, alg, counter FROM passkey_credentials WHERE session_id = ?")
    .all(sessionId) as CredentialRow[];

function putChallenge(challenge: string, sessionId: string, kind: "register" | "confirm", intentId?: string, nonce?: string) {
  getDb()
    .prepare("INSERT INTO passkey_challenges (challenge, session_id, kind, intent_id, nonce, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(challenge, sessionId, kind, intentId ?? null, nonce ?? null, new Date(Date.now() + CHALLENGE_TTL_MS).toISOString());
}

/** Removes and returns the challenge a response answers. Consumed even if the response then fails. */
function takeChallenge(clientDataJSON: string, sessionId: string, kind: "register" | "confirm", intentId?: string) {
  let challenge: string;
  try {
    challenge = JSON.parse(new TextDecoder().decode(fromB64u(clientDataJSON))).challenge;
  } catch {
    throw new PasskeyError("Malformed passkey response.");
  }
  const db = getDb();
  const row = db.prepare("SELECT * FROM passkey_challenges WHERE challenge = ?").get(challenge) as
    { challenge: string; session_id: string; kind: string; intent_id: string | null; nonce: string | null; expires_at: string } | undefined;
  db.prepare("DELETE FROM passkey_challenges WHERE challenge = ? OR expires_at < ?").run(challenge, nowIso());
  if (!row || row.session_id !== sessionId || row.kind !== kind || (intentId !== undefined && row.intent_id !== intentId)) {
    throw new PasskeyError("This passkey challenge is unknown, already used, or for another purchase. Try again.");
  }
  if (row.expires_at < nowIso()) throw new PasskeyError("This passkey challenge expired. Try again.");
  return row;
}

/** COSE public key → JWK, so a browser can re-check signatures with Web Crypto. */
function coseToJwk(bytes: Uint8Array<ArrayBuffer>): { jwk: JsonWebKey; alg: number } {
  const key = decodeCredentialPublicKey(bytes);
  const alg = key.get(cose.COSEKEYS.alg);
  if (cose.isCOSEPublicKeyEC2(key) && alg === -7 && key.get(cose.COSEKEYS.crv) === cose.COSECRV.P256) {
    return { alg, jwk: { kty: "EC", crv: "P-256", x: toB64u(key.get(cose.COSEKEYS.x)!), y: toB64u(key.get(cose.COSEKEYS.y)!) } };
  }
  if (cose.isCOSEPublicKeyOKP(key) && alg === -8 && key.get(cose.COSEKEYS.crv) === cose.COSECRV.ED25519) {
    return { alg, jwk: { kty: "OKP", crv: "Ed25519", x: toB64u(key.get(cose.COSEKEYS.x)!) } };
  }
  if (cose.isCOSEPublicKeyRSA(key) && alg === -257) {
    return { alg, jwk: { kty: "RSA", n: toB64u(key.get(cose.COSEKEYS.n)!), e: toB64u(key.get(cose.COSEKEYS.e)!) } };
  }
  throw new PasskeyError("This passkey uses an algorithm receipts cannot be verified with. Use another passkey or confirm without one.");
}

export async function registrationOptions(sessionId: string) {
  const { rpID } = relyingParty();
  const options = await generateRegistrationOptions({
    rpName: "IntentReceipt",
    rpID,
    userName: "IntentReceipt demo buyer",
    userDisplayName: "Demo buyer",
    attestationType: "none",
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    supportedAlgorithmIDs: ALGS,
    excludeCredentials: sessionCredentials(sessionId).map((c) => ({ id: c.id })),
  });
  putChallenge(options.challenge, sessionId, "register");
  return options;
}

export async function verifyRegistration(sessionId: string, response: RegistrationResponseJSON): Promise<{ credential_id: string }> {
  const row = takeChallenge(response.response.clientDataJSON, sessionId, "register");
  const { rpID, origin } = relyingParty();
  let v;
  try {
    v = await verifyRegistrationResponse({
      response,
      expectedChallenge: row.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      supportedAlgorithmIDs: ALGS,
    });
  } catch (e) {
    throw new PasskeyError(`Passkey registration failed: ${(e as Error).message}`);
  }
  if (!v.verified) throw new PasskeyError("Passkey registration could not be verified.");
  const { credential } = v.registrationInfo;
  const { jwk, alg } = coseToJwk(credential.publicKey);
  // Credential ids come from the client: never let a registration take over an existing one.
  const inserted = getDb()
    .prepare(
      "INSERT OR IGNORE INTO passkey_credentials (id, session_id, public_key_cose, public_key_jwk, alg, counter, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(credential.id, sessionId, toB64u(credential.publicKey), JSON.stringify(jwk), alg, credential.counter, nowIso());
  if (inserted.changes === 0) throw new PasskeyError("This passkey is already registered.");
  return { credential_id: credential.id };
}

/** Request options whose challenge commits to this purchase's card text; `registered: false` means create a passkey first. */
export async function confirmOptions(
  sessionId: string,
  intentId: string,
): Promise<{ registered: boolean; options?: PublicKeyCredentialRequestOptionsJSON }> {
  const intent = getIntent(intentId);
  if (!intent || intent.status !== "DRAFT") throw new PasskeyError("This purchase cannot be confirmed.");
  const creds = sessionCredentials(sessionId);
  if (!creds.length) return { registered: false };
  const nonce = toB64u(crypto.randomBytes(16));
  const challenge = await confirmChallengeBytes({
    intent_id: intentId,
    presented_text_sha256: sha256Hex(cardText(confirmationCard(intent.record))),
    nonce,
  });
  const options = await generateAuthenticationOptions({
    rpID: relyingParty().rpID,
    challenge,
    allowCredentials: creds.map((c) => ({ id: c.id })),
    userVerification: "preferred",
  });
  putChallenge(options.challenge, sessionId, "confirm", intentId, nonce);
  return { registered: true, options };
}

/** Checks the assertion for this purchase and returns the proof to store in the confirmation. */
export async function verifyConfirmation(
  sessionId: string,
  intentId: string,
  presentedText: string,
  response: AuthenticationResponseJSON,
): Promise<PasskeyProof> {
  const row = takeChallenge(response.response.clientDataJSON, sessionId, "confirm", intentId);
  // The challenge must commit to the text being confirmed, not just to the purchase.
  const expected = toB64u(
    await confirmChallengeBytes({ intent_id: intentId, presented_text_sha256: sha256Hex(presentedText), nonce: row.nonce! }),
  );
  if (expected !== row.challenge) throw new PasskeyError("The passkey signed a different card text. Reload and try again.");
  const cred = getDb()
    .prepare("SELECT id, public_key_cose, public_key_jwk, alg, counter FROM passkey_credentials WHERE id = ? AND session_id = ?")
    .get(response.id, sessionId) as CredentialRow | undefined;
  if (!cred) throw new PasskeyError("This passkey was not created for this browser session.");
  const { rpID, origin } = relyingParty();
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: row.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: cred.id, publicKey: fromB64u(cred.public_key_cose), counter: cred.counter },
      requireUserVerification: false,
    });
  } catch (e) {
    throw new PasskeyError(`Passkey check failed: ${(e as Error).message}`);
  }
  if (!v.verified) throw new PasskeyError("The passkey signature could not be verified.");
  getDb().prepare("UPDATE passkey_credentials SET counter = ? WHERE id = ?").run(v.authenticationInfo.newCounter, cred.id);
  return {
    scheme: PASSKEY_SCHEME,
    rp_id: rpID,
    origin,
    credential_id: cred.id,
    public_key_jwk: JSON.parse(cred.public_key_jwk),
    alg: cred.alg,
    nonce: row.nonce!,
    authenticator_data: response.response.authenticatorData,
    client_data_json: response.response.clientDataJSON,
    signature: response.response.signature,
    user_verified: v.authenticationInfo.userVerified,
  };
}
