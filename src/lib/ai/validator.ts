// Evidence validator (§10.3). Every citation the analyst makes is an RFC 6901
// JSON Pointer into the context object; quoted_value must equal the value there.

export function parsePointer(pointer: string): string[] | null {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return null;
  return pointer
    .slice(1)
    .split("/")
    .map((t) => t.replace(/~1/g, "/").replace(/~0/g, "~"));
}

export function resolvePointer(doc: unknown, pointer: string): { found: true; value: unknown } | { found: false } {
  const tokens = parsePointer(pointer);
  if (tokens === null) return { found: false };
  let cur: unknown = doc;
  for (const t of tokens) {
    if (Array.isArray(cur)) {
      if (!/^(0|[1-9][0-9]*)$/.test(t)) return { found: false };
      const i = Number(t);
      if (i >= cur.length) return { found: false };
      cur = cur[i];
    } else if (cur !== null && typeof cur === "object") {
      if (!Object.prototype.hasOwnProperty.call(cur, t)) return { found: false };
      cur = (cur as Record<string, unknown>)[t];
    } else {
      return { found: false };
    }
  }
  return { found: true, value: cur };
}

export const normalizeText = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

export function valuesEqual(actual: unknown, quoted: unknown): boolean {
  if (typeof actual === "number") {
    const q = typeof quoted === "number" ? quoted : typeof quoted === "string" && quoted.trim() !== "" ? Number(quoted) : NaN;
    return Number.isFinite(q) && Math.abs(actual - q) < 1e-9;
  }
  if (typeof actual === "string") {
    if (typeof quoted !== "string" && typeof quoted !== "number") return false;
    return normalizeText(actual) === normalizeText(String(quoted));
  }
  if (typeof actual === "boolean") return actual === quoted || String(actual) === String(quoted);
  if (actual === null) return quoted === null || quoted === "null";
  // Objects/arrays: compare canonical JSON (citations should target leaves, but be exact if not).
  try {
    return JSON.stringify(actual) === JSON.stringify(typeof quoted === "string" ? JSON.parse(quoted) : quoted);
  } catch {
    return false;
  }
}

export interface EvidenceLike {
  id: string;
  pointer: string;
  quoted_value: unknown;
}

export interface ValidationItem {
  id: string;
  ok: boolean;
  reason?: string;
}

export interface ValidationResult {
  verified: number;
  failed: number;
  items: ValidationItem[];
}

export function validateEvidence(context: unknown, evidence: EvidenceLike[]): ValidationResult {
  const items = evidence.map((e): ValidationItem => {
    const r = resolvePointer(context, e.pointer);
    if (!r.found) return { id: e.id, ok: false, reason: `pointer ${e.pointer} not found in context` };
    if (!valuesEqual(r.value, e.quoted_value)) {
      const shown = typeof r.value === "string" ? r.value.slice(0, 80) : JSON.stringify(r.value)?.slice(0, 80);
      return { id: e.id, ok: false, reason: `quoted value does not match source (source: ${shown})` };
    }
    return { id: e.id, ok: true };
  });
  const verified = items.filter((i) => i.ok).length;
  return { verified, failed: items.length - verified, items };
}

// Instruction-like text in untrusted dispute messages (flagged in the UI; the
// analyst prompt also treats it as data).
const INJECTION_PATTERNS = [
  /ignore (all |any )?(the )?(previous|prior|above) (instructions|prompts?)/i,
  /disregard (all |any )?(previous|prior|your) (instructions|rules)/i,
  /\byou are now\b/i,
  /\bsystem prompt\b/i,
  /mark this dispute as/i,
  /\bact as\b.*\b(admin|system|developer)\b/i,
];

export function detectInstructionLikeText(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}
