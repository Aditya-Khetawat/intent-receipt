// Canonical JSON (isomorphic: used by the server and by the in-browser Verify).
// Rules: object keys sorted recursively by UTF-16 code unit order (as RFC 8785 JCS),
// no insignificant whitespace, strings escaped by JSON.stringify, numbers must be
// finite. `undefined` object members are omitted, as JSON.stringify does.
// For the integers and short decimals this project stores, JSON.stringify's number
// serialization matches JCS (ECMAScript Number::toString).

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new Error("canonicalize: non-finite number");
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return "[" + value.map((v) => (v === undefined ? "null" : canonicalize(v))).join(",") + "]";
      }
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
      return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
    }
    default:
      throw new Error(`canonicalize: unsupported type ${typeof value}`);
  }
}

export const GENESIS_HASH = "0".repeat(64);

export type LedgerType = "INTENT_CONFIRMED" | "ORDER_CREATED" | "CAPTURE_COMPLETED";

export interface LedgerEntry {
  seq: number;
  type: LedgerType;
  intent_id: string;
  payload: unknown;
  prev_hash: string;
  hash: string;
  signature: string; // base64
  key_id: string;
  created_at: string;
}

/** The exact bytes that are hashed for an entry. */
export function entryHashInput(e: Pick<LedgerEntry, "seq" | "type" | "intent_id" | "payload" | "prev_hash">): string {
  return canonicalize({
    seq: e.seq,
    type: e.type,
    intent_id: e.intent_id,
    payload: e.payload,
    prev_hash: e.prev_hash,
  });
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
