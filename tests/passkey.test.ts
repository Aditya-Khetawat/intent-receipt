import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "@/lib/db";
import { cardText, confirmationCard, confirmIntent, getIntent } from "@/lib/intents";
import { createExampleProposal, ensureSession } from "@/lib/ai/agent";
import { confirmOptions, registrationOptions, verifyConfirmation, verifyRegistration } from "@/lib/passkey/server";
import { softAuthenticator } from "./helpers/softAuthenticator";
import { verifyPasskeyProof } from "@/lib/passkey/verify";
import { verifyEvidenceBundle } from "@/lib/evidence/verify";
import { buildEvidenceBundle } from "@/lib/evidence/bundle";
import { publicKeyDocument } from "@/lib/ledger/keys";
import { sha256Hex } from "@/lib/ledger";

const textOf = (id: string) => cardText(confirmationCard(getIntent(id)!.record));
const flip = (b64u: string) => {
  const b = Buffer.from(b64u, "base64url");
  b[b.length - 1] ^= 0x01;
  return b.toString("base64url");
};

async function registered() {
  const sid = ensureSession(null);
  const auth = softAuthenticator();
  await verifyRegistration(sid, auth.register(await registrationOptions(sid)));
  return { sid, auth };
}

describe("passkey confirmation", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("asks for a passkey to be created when the session has none", async () => {
    const sid = ensureSession(null);
    const draft = createExampleProposal(sid);
    expect(await confirmOptions(sid, draft.id)).toEqual({ registered: false });
  });

  it("signs the card's hash and records the proof in the confirmation", async () => {
    const { sid, auth } = await registered();
    const draft = createExampleProposal(sid);
    expect(draft.record.agent.provider).toBe("none");
    const { options } = await confirmOptions(sid, draft.id);
    const proof = await verifyConfirmation(sid, draft.id, textOf(draft.id), auth.sign(options!));
    expect(proof).toMatchObject({
      scheme: "webauthn-confirm/1",
      rp_id: "localhost",
      origin: "http://localhost:3000",
      credential_id: auth.id,
      alg: -7,
      user_verified: true,
    });
    const confirmed = confirmIntent(draft.id, textOf(draft.id), "nonce-12345678", { passkey: proof });
    expect(confirmed.record.confirmation?.method).toBe("passkey");
    expect(confirmed.record.confirmation?.passkey?.signature).toBe(proof.signature);
  });

  it("rejects a replayed response: each challenge is used once", async () => {
    const { sid, auth } = await registered();
    const draft = createExampleProposal(sid);
    const res = auth.sign((await confirmOptions(sid, draft.id)).options!);
    await verifyConfirmation(sid, draft.id, textOf(draft.id), res);
    await expect(verifyConfirmation(sid, draft.id, textOf(draft.id), res)).rejects.toThrow(/challenge/);
  });

  it("rejects a response made for another purchase", async () => {
    const { sid, auth } = await registered();
    const a = createExampleProposal(sid);
    const b = createExampleProposal(sid);
    const res = auth.sign((await confirmOptions(sid, a.id)).options!);
    await expect(verifyConfirmation(sid, b.id, textOf(b.id), res)).rejects.toThrow(/challenge/);
  });

  it("rejects a bad signature and an unregistered passkey", async () => {
    const { sid, auth } = await registered();
    const draft = createExampleProposal(sid);
    const res = auth.sign((await confirmOptions(sid, draft.id)).options!);
    res.response.signature = flip(res.response.signature);
    await expect(verifyConfirmation(sid, draft.id, textOf(draft.id), res)).rejects.toThrow();

    const stranger = softAuthenticator();
    const res2 = stranger.sign((await confirmOptions(sid, draft.id)).options!);
    await expect(verifyConfirmation(sid, draft.id, textOf(draft.id), res2)).rejects.toThrow(/passkey/i);
  });

  it("refuses a registration that reuses another session's credential id", async () => {
    const { sid, auth } = await registered();
    const intruder = ensureSession(null);
    await expect(verifyRegistration(intruder, auth.register(await registrationOptions(intruder)))).rejects.toThrow(/already registered/);
    const draft = createExampleProposal(sid);
    expect((await confirmOptions(sid, draft.id)).registered).toBe(true);
  });

  it("cannot use another browser session's passkey", async () => {
    const { auth } = await registered();
    const other = ensureSession(null);
    const draft = createExampleProposal(other);
    expect(await confirmOptions(other, draft.id)).toEqual({ registered: false });
    void auth;
  });
});

describe("passkey proof in receipts and packs", () => {
  beforeEach(() => {
    resetTestDb();
  });

  async function passkeyReceipt() {
    const { sid, auth } = await registered();
    const draft = createExampleProposal(sid);
    const proof = await verifyConfirmation(sid, draft.id, textOf(draft.id), auth.sign((await confirmOptions(sid, draft.id)).options!));
    return confirmIntent(draft.id, textOf(draft.id), "nonce-12345678", { passkey: proof });
  }

  it("verifies in the shared checker and makes the pack verify", async () => {
    const intent = await passkeyReceipt();
    expect((await verifyPasskeyProof(intent.record)).ok).toBe(true);
    const r = await verifyEvidenceBundle(buildEvidenceBundle(intent.id), { trustedKey: publicKeyDocument() });
    expect(r.checks.find((c) => c.id === "passkey")).toMatchObject({ ok: true });
    expect(r.verdict).toBe("verified");
  });

  it("fails when the card text and its hash are both rewritten", async () => {
    const intent = await passkeyReceipt();
    const rec = JSON.parse(JSON.stringify(intent.record));
    rec.confirmation.presented_text = "Brightpine Ridge Pack (black, 30 L)";
    rec.confirmation.presented_text_sha256 = sha256Hex(rec.confirmation.presented_text);
    expect(await verifyPasskeyProof(rec)).toMatchObject({ ok: false, detail: expect.stringMatching(/challenge/) });
  });

  it("fails on a flipped signature byte", async () => {
    const intent = await passkeyReceipt();
    const rec = JSON.parse(JSON.stringify(intent.record));
    rec.confirmation.passkey.signature = flip(rec.confirmation.passkey.signature);
    const r = await verifyPasskeyProof(rec);
    expect(r.ok).toBe(false);
  });

  it("reports a seeded button confirmation as not used, without failing the pack", async () => {
    const r = await verifyEvidenceBundle(buildEvidenceBundle("ir_seed_s1_ridge40"), { trustedKey: publicKeyDocument() });
    expect(r.checks.find((c) => c.id === "passkey")).toMatchObject({ ok: null });
    expect(r.verdict).toBe("verified");
  });
});
