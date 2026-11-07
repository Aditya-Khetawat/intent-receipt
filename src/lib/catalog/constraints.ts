import { z } from "zod";
import type { VariantAttributes } from "./data";

// Deterministic constraint checker (§8.1). The LLM extracts constraints; this code,
// not the model, decides whether the selection meets them.

export const CHECKER_VERSION = "constraints@1";

export const CONSTRAINT_KEYS = [
  "max_price",
  "min_price",
  "color",
  "size",
  "capacity_liters",
  "length_m",
  "connector",
  "category",
  "brand_exclude",
  "quantity",
  "deliver_by",
  "feature",
] as const;

export type ConstraintKey = (typeof CONSTRAINT_KEYS)[number];

export const constraintSchema = z.object({
  key: z.enum(CONSTRAINT_KEYS),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  source_turn: z.number().int().min(0).default(0),
  confidence: z.number().min(0).max(1).default(0.9),
});
export type Constraint = z.infer<typeof constraintSchema>;

export type CheckStatus = "MET" | "UNMET" | "UNKNOWN";

export interface CheckResult {
  key: ConstraintKey;
  status: CheckStatus;
  expected: string | number;
  actual: string | number | null;
  note?: string;
}

export interface CheckTarget {
  brand: string;
  category: string;
  attributes: VariantAttributes;
  unit_price_cents: number;
  quantity: number;
  est_delivery_days: number | null;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, " ");
const num = (v: string | number): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

function checkOne(c: Constraint, t: CheckTarget, now: Date): CheckResult {
  const base = { key: c.key, expected: c.value };
  const totalDollars = (t.unit_price_cents * t.quantity) / 100;
  const a = t.attributes;
  const unknown = (note: string): CheckResult => ({ ...base, status: "UNKNOWN", actual: null, note });
  const cmp = (ok: boolean, actual: string | number): CheckResult => ({
    ...base,
    status: ok ? "MET" : "UNMET",
    actual,
  });

  switch (c.key) {
    case "max_price": {
      const n = num(c.value);
      return n === null ? unknown("unparseable price") : cmp(totalDollars <= n + 1e-9, totalDollars);
    }
    case "min_price": {
      const n = num(c.value);
      return n === null ? unknown("unparseable price") : cmp(totalDollars + 1e-9 >= n, totalDollars);
    }
    case "color":
      return a.color === undefined ? unknown("item has no color attribute") : cmp(norm(a.color) === norm(String(c.value)), a.color);
    case "size":
      return a.size === undefined
        ? unknown("item has no size attribute")
        : cmp(norm(a.size).replace(/ /g, "") === norm(String(c.value)).replace(/ /g, ""), a.size);
    case "capacity_liters": {
      const n = num(c.value);
      if (a.capacity_liters === undefined) return unknown("item has no capacity attribute");
      return n === null ? unknown("unparseable capacity") : cmp(close(a.capacity_liters, n), a.capacity_liters);
    }
    case "length_m": {
      const n = num(c.value);
      if (a.length_m === undefined) return unknown("item has no length attribute");
      return n === null ? unknown("unparseable length") : cmp(close(a.length_m, n), a.length_m);
    }
    case "connector":
      return a.connector === undefined
        ? unknown("item has no connector attribute")
        : cmp(norm(a.connector).replace(/ /g, "") === norm(String(c.value)).replace(/ /g, ""), a.connector);
    case "category":
      return cmp(norm(t.category) === norm(String(c.value)), t.category);
    case "brand_exclude":
      return cmp(norm(t.brand) !== norm(String(c.value)), t.brand);
    case "quantity": {
      const n = num(c.value);
      return n === null ? unknown("unparseable quantity") : cmp(t.quantity === n, t.quantity);
    }
    case "feature": {
      if (!a.features) return unknown("item lists no features");
      const want = norm(String(c.value));
      return cmp(a.features.some((f) => norm(f) === want), a.features.join(", "));
    }
    case "deliver_by": {
      const by = new Date(String(c.value));
      if (Number.isNaN(by.getTime())) return unknown("deliver_by is not a date");
      if (t.est_delivery_days === null) return unknown("no delivery estimate");
      const eta = new Date(now.getTime() + t.est_delivery_days * 86_400_000);
      return cmp(eta.getTime() <= by.getTime() + 86_400_000 - 1, eta.toISOString().slice(0, 10));
    }
  }
}

export function checkConstraints(constraints: Constraint[], target: CheckTarget, now = new Date()) {
  return {
    checker_version: CHECKER_VERSION,
    results: constraints.map((c) => checkOne(c, target, now)),
  };
}

export function hasUnmet(results: CheckResult[]): boolean {
  return results.some((r) => r.status === "UNMET");
}
