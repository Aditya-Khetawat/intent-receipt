import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "@/lib/db";
import { cardText, confirmationCard, confirmIntent, getIntent } from "@/lib/intents";
import { createExampleProposal, ensureSession } from "@/lib/ai/agent";
import { confirmOptions, registrationOptions, verifyConfirmation, verifyRegistration } from "@/lib/passkey/server";
import { softAuthenticator } from "./helpers/softAuthenticator";

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

  it("cannot use another browser session's passkey", async () => {
    const { auth } = await registered();
    const other = ensureSession(null);
    const draft = createExampleProposal(other);
    expect(await confirmOptions(other, draft.id)).toEqual({ registered: false });
    void auth;
  });
});
