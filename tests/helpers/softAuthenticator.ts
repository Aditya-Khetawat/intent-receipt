import crypto from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";

// A software WebAuthn authenticator (P-256, ES256, "none" attestation) for tests:
// it produces registration and authentication responses a real browser would send.

const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const sha256 = (b: Uint8Array | string) => crypto.createHash("sha256").update(b).digest();
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};

export function softAuthenticator(opts: { rpId?: string; origin?: string; userVerified?: boolean } = {}) {
  const rpId = opts.rpId ?? "localhost";
  const origin = opts.origin ?? "http://localhost:3000";
  const flagsBase = 0x01 | (opts.userVerified === false ? 0 : 0x04);
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const credId = crypto.randomBytes(16);
  const id = b64u(credId);
  let counter = 0;

  const coseKey = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x, "base64url")],
      [-3, Buffer.from(jwk.y, "base64url")],
    ]),
  );

  return {
    id,
    register(options: { challenge: string }) {
      const clientDataJSON = Buffer.from(
        JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin, crossOrigin: false }),
      );
      const credLen = Buffer.alloc(2);
      credLen.writeUInt16BE(credId.length);
      const authData = Buffer.concat([
        sha256(rpId),
        Buffer.from([flagsBase | 0x40]),
        u32(counter),
        Buffer.alloc(16),
        credLen,
        credId,
        coseKey,
      ]);
      const attestationObject = isoCBOR.encode(
        new Map<string, unknown>([
          ["fmt", "none"],
          ["attStmt", new Map()],
          ["authData", authData],
        ]) as never,
      );
      return {
        id,
        rawId: id,
        type: "public-key" as const,
        response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(attestationObject), transports: ["internal" as const] },
        clientExtensionResults: {},
        authenticatorAttachment: "platform" as const,
      };
    },
    sign(options: { challenge: string }) {
      counter++;
      const clientDataJSON = Buffer.from(
        JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin, crossOrigin: false }),
      );
      const authData = Buffer.concat([sha256(rpId), Buffer.from([flagsBase]), u32(counter)]);
      const signature = crypto.sign("sha256", Buffer.concat([authData, sha256(clientDataJSON)]), privateKey);
      return {
        id,
        rawId: id,
        type: "public-key" as const,
        response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authData), signature: b64u(signature) },
        clientExtensionResults: {},
        authenticatorAttachment: "platform" as const,
      };
    },
  };
}
