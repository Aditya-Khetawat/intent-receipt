// Fictional seed catalog (Appendix A). No real brands.

export interface VariantAttributes {
  color?: string;
  size?: string;
  capacity_liters?: number;
  length_m?: number;
  connector?: string;
  capacity_mah?: number;
  tone?: string;
  features?: string[];
}

export interface SeedVariant {
  id: string;
  sku: string;
  attributes: VariantAttributes;
  price_cents: number;
  stock: number;
  est_delivery_days: number;
}

export interface SeedProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  variants: SeedVariant[];
}

export const MERCHANT = { id: "merchant_fernhill", name: "Fernhill Outfitters" };

export const BUYERS = [
  { id: "buyer_demo_1", display_name: "Maya Rao", email_demo: "maya.demo@example.test" },
  { id: "buyer_demo_2", display_name: "Jonah Ellis", email_demo: "jonah.demo@example.test" },
  { id: "buyer_demo_3", display_name: "Priya Shah", email_demo: "priya.demo@example.test" },
  { id: "buyer_demo_4", display_name: "Sam Okafor", email_demo: "sam.demo@example.test" },
];

const v = (
  id: string,
  sku: string,
  attributes: VariantAttributes,
  dollars: number,
  stock = 25,
  est_delivery_days = 4,
): SeedVariant => ({ id, sku, attributes, price_cents: Math.round(dollars * 100), stock, est_delivery_days });

export const CATALOG: SeedProduct[] = [
  {
    id: "p_ridge_pack",
    name: "Brightpine Ridge Pack",
    brand: "Brightpine",
    category: "backpack",
    description: "Waterproof roll-top hiking backpack with padded hip belt. Available in 30L and 40L.",
    variants: [
      v("v_ridge_30_black", "BP-RIDGE-30-BLK", { color: "black", size: "30L", capacity_liters: 30, features: ["waterproof"] }, 69),
      v("v_ridge_30_olive", "BP-RIDGE-30-OLV", { color: "olive", size: "30L", capacity_liters: 30, features: ["waterproof"] }, 69),
      v("v_ridge_40_black", "BP-RIDGE-40-BLK", { color: "black", size: "40L", capacity_liters: 40, features: ["waterproof"] }, 79),
      v("v_ridge_40_olive", "BP-RIDGE-40-OLV", { color: "olive", size: "40L", capacity_liters: 40, features: ["waterproof"] }, 79),
    ],
  },
  {
    id: "p_summit_pack",
    name: "Brightpine Summit Pack",
    brand: "Brightpine",
    category: "backpack",
    description: "Large 50L expedition backpack with rain cover.",
    variants: [
      v("v_summit_50_black", "BP-SUMMIT-50-BLK", { color: "black", size: "50L", capacity_liters: 50, features: ["water-resistant"] }, 119),
    ],
  },
  {
    id: "p_usbc_cable",
    name: "Marlowe Labs USB-C Cable",
    brand: "Marlowe Labs",
    category: "cable",
    description: "Braided USB-C to USB-C fast-charge cable (60W).",
    variants: [
      v("v_cable_1m_black", "ML-USBC-1M-BLK", { color: "black", length_m: 1, connector: "USB-C", features: ["fast-charge"] }, 14),
      v("v_cable_1m_white", "ML-USBC-1M-WHT", { color: "white", length_m: 1, connector: "USB-C", features: ["fast-charge"] }, 14),
      v("v_cable_2m_black", "ML-USBC-2M-BLK", { color: "black", length_m: 2, connector: "USB-C", features: ["fast-charge"] }, 17),
      v("v_cable_2m_white", "ML-USBC-2M-WHT", { color: "white", length_m: 2, connector: "USB-C", features: ["fast-charge"] }, 18, 0),
    ],
  },
  {
    id: "p_power_bank",
    name: "Marlowe Labs Power Bank",
    brand: "Marlowe Labs",
    category: "power bank",
    description: "Slim USB-C power bank with pass-through charging.",
    variants: [
      v("v_pb_10k_black", "ML-PB-10K-BLK", { color: "black", capacity_mah: 10000, connector: "USB-C" }, 29),
      v("v_pb_20k_black", "ML-PB-20K-BLK", { color: "black", capacity_mah: 20000, connector: "USB-C" }, 45),
    ],
  },
  {
    id: "p_trail_bottle",
    name: "Quillon Trail Bottle",
    brand: "Quillon",
    category: "bottle",
    description: "Insulated stainless steel bottle, keeps drinks cold for 24h.",
    variants: [
      v("v_bottle_075_steel", "QL-BTL-075-STL", { color: "steel", capacity_liters: 0.75, features: ["insulated"] }, 24),
      v("v_bottle_1_steel", "QL-BTL-100-STL", { color: "steel", capacity_liters: 1, features: ["insulated"] }, 27),
      v("v_bottle_1_green", "QL-BTL-100-GRN", { color: "matte green", capacity_liters: 1, features: ["insulated"] }, 27),
    ],
  },
  {
    id: "p_merino_socks",
    name: "Alder & Finch Merino Socks",
    brand: "Alder & Finch",
    category: "socks",
    description: "Midweight merino wool hiking socks.",
    variants: ["S", "M", "L"].flatMap((size) =>
      ["grey", "navy"].map((color) =>
        v(`v_socks_${size.toLowerCase()}_${color}`, `AF-SOCK-${size}-${color.slice(0, 3).toUpperCase()}`, { color, size }, 18),
      ),
    ),
  },
  {
    id: "p_rain_shell",
    name: "Alder & Finch Rain Shell",
    brand: "Alder & Finch",
    category: "jacket",
    description: "Packable waterproof rain jacket with taped seams.",
    variants: ["M", "L", "XL"].flatMap((size) =>
      ["navy", "green"].map((color) =>
        v(
          `v_shell_${size.toLowerCase()}_${color}`,
          `AF-SHELL-${size}-${color.slice(0, 3).toUpperCase()}`,
          { color, size, features: ["waterproof"] },
          89,
          12,
          5,
        ),
      ),
    ),
  },
  {
    id: "p_dry_bag",
    name: "Tidewell Dry Bag",
    brand: "Tidewell",
    category: "dry bag",
    description: "Roll-top waterproof dry bag for paddling and camping.",
    variants: [
      v("v_drybag_10_yellow", "TW-DRY-10-YEL", { color: "yellow", size: "10L", capacity_liters: 10, features: ["waterproof"] }, 19),
      v("v_drybag_20_yellow", "TW-DRY-20-YEL", { color: "yellow", size: "20L", capacity_liters: 20, features: ["waterproof"] }, 24),
      v("v_drybag_20_blue", "TW-DRY-20-BLU", { color: "blue", size: "20L", capacity_liters: 20, features: ["waterproof"] }, 24),
    ],
  },
  {
    id: "p_camp_lantern",
    name: "Tidewell Camp Lantern",
    brand: "Tidewell",
    category: "lantern",
    description: "Rechargeable LED camp lantern, 300 lumens.",
    variants: [
      v("v_lantern_warm", "TW-LANT-WRM", { tone: "warm", color: "grey" }, 22),
      v("v_lantern_cool", "TW-LANT-COOL", { tone: "cool", color: "grey" }, 22),
    ],
  },
  {
    id: "p_trek_poles",
    name: "Quillon Trekking Poles",
    brand: "Quillon",
    category: "trekking poles",
    description: "Adjustable aluminium trekking poles, 100 to 120 cm, pair.",
    variants: [v("v_poles_black", "QL-POLE-BLK", { color: "black", size: "100-120 cm" }, 39)],
  },
];
