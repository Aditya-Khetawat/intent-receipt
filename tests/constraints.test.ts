import { describe, expect, it } from "vitest";
import { checkConstraints, type CheckTarget, type Constraint } from "@/lib/catalog/constraints";

const pack: CheckTarget = {
  brand: "Brightpine",
  category: "backpack",
  attributes: { color: "black", size: "40L", capacity_liters: 40, features: ["waterproof"] },
  unit_price_cents: 7900,
  quantity: 1,
  est_delivery_days: 4,
};
const c = (key: Constraint["key"], value: string | number): Constraint => ({ key, value, source_turn: 0, confidence: 1 });
const status = (cs: Constraint[], t: CheckTarget = pack, now?: Date) => checkConstraints(cs, t, now).results.map((r) => r.status);

describe("constraint checker", () => {
  it("checks price bounds against the line total", () => {
    expect(status([c("max_price", 85), c("max_price", 70), c("min_price", 50)])).toEqual(["MET", "UNMET", "MET"]);
    expect(status([c("max_price", 100)], { ...pack, quantity: 2 })).toEqual(["UNMET"]);
  });
  it("normalizes strings for color, size and connector", () => {
    expect(status([c("color", "Black"), c("size", "40 L"), c("color", "olive")])).toEqual(["MET", "MET", "UNMET"]);
    const cable = { ...pack, category: "cable", attributes: { color: "white", length_m: 1, connector: "USB-C" } };
    expect(status([c("connector", "usb c"), c("length_m", 2), c("length_m", "1 m")], cable)).toEqual(["MET", "UNMET", "MET"]);
  });
  it("checks numeric capacity, category, brand exclusion, quantity and features", () => {
    expect(status([c("capacity_liters", "40"), c("category", "Backpack"), c("brand_exclude", "Brightpine"), c("quantity", 1), c("feature", "waterproof")])).toEqual([
      "MET",
      "MET",
      "UNMET",
      "MET",
      "MET",
    ]);
  });
  it("returns UNKNOWN instead of guessing", () => {
    const lantern = { ...pack, attributes: { tone: "warm" } };
    expect(status([c("color", "grey"), c("length_m", 2), c("feature", "waterproof"), c("deliver_by", "not a date")], lantern)).toEqual([
      "UNKNOWN",
      "UNKNOWN",
      "UNKNOWN",
      "UNKNOWN",
    ]);
    expect(status([c("deliver_by", "2026-12-01")], { ...pack, est_delivery_days: null as unknown as number })).toEqual(["UNKNOWN"]);
  });
  it("checks deliver_by against the estimated delivery days", () => {
    const now = new Date("2026-11-07T10:00:00Z");
    expect(status([c("deliver_by", "2026-11-11"), c("deliver_by", "2026-11-10")], pack, now)).toEqual(["MET", "UNMET"]);
  });
});
