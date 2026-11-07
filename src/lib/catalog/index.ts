import { getDb } from "@/lib/db";
import type { VariantAttributes } from "./data";

export interface Variant {
  id: string;
  product_id: string;
  sku: string;
  attributes: VariantAttributes;
  price_cents: number;
  stock: number;
  est_delivery_days: number;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  currency: string;
  variants: Variant[];
}

interface VariantRow {
  id: string;
  product_id: string;
  sku: string;
  attributes_json: string;
  price_cents: number;
  stock: number;
  est_delivery_days: number;
}

function loadVariants(productId: string): Variant[] {
  return (getDb().prepare("SELECT * FROM variants WHERE product_id = ? ORDER BY price_cents, sku").all(productId) as VariantRow[]).map(
    (r) => ({ ...r, attributes: JSON.parse(r.attributes_json) as VariantAttributes }),
  );
}

export function getProduct(id: string): Product | null {
  const p = getDb().prepare("SELECT * FROM products WHERE id = ?").get(id) as Omit<Product, "variants"> | undefined;
  return p ? { ...p, variants: loadVariants(p.id) } : null;
}

export function getVariant(id: string): (Variant & { product: Omit<Product, "variants"> }) | null {
  const r = getDb().prepare("SELECT * FROM variants WHERE id = ?").get(id) as VariantRow | undefined;
  if (!r) return null;
  const product = getDb().prepare("SELECT * FROM products WHERE id = ?").get(r.product_id) as Omit<Product, "variants">;
  return { ...r, attributes: JSON.parse(r.attributes_json), product };
}

export function listProducts(): Product[] {
  return (getDb().prepare("SELECT * FROM products ORDER BY name").all() as Omit<Product, "variants">[]).map((p) => ({
    ...p,
    variants: loadVariants(p.id),
  }));
}

const STOP = new Set(["a", "an", "the", "for", "i", "need", "want", "in", "under", "with", "and", "of", "to", "my", "me", "some"]);

/** Keyword search with light scoring. Deterministic; no AI. */
export function searchCatalog(query: string, filters: { category?: string } = {}) {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
  const scored = listProducts()
    .map((p) => {
      const hay = [p.name, p.brand, p.category, p.description, ...p.variants.map((v) => JSON.stringify(v.attributes))]
        .join(" ")
        .toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t.replace(/s$/, "")) ? 1 : 0), 0);
      return { p, score };
    })
    .filter(({ p, score }) => {
      if (filters.category && !p.category.toLowerCase().includes(filters.category.toLowerCase())) return false;
      return score > 0 || terms.length === 0;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return scored.map(({ p }) => ({
    product_id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    description: p.description,
    // All variants are returned (including over-budget and out-of-stock ones) so the
    // agent can explain trade-offs; the constraint checker judges the final pick.
    variants: p.variants.map((v) => ({
        variant_id: v.id,
        sku: v.sku,
        attributes: v.attributes,
        price_usd: v.price_cents / 100,
        in_stock: v.stock > 0,
        est_delivery_days: v.est_delivery_days,
      })),
  }));
}
