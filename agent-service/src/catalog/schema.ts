import { z } from "zod";

/**
 * Catalog contracts + deterministic generation for the Recova stress-test
 * catalog (W06).
 *
 * This module has two responsibilities:
 *
 * 1. **Schemas** — the `CatalogProduct` / `CatalogVariant` shape described in
 *    `docs/CATALOG_IMPORT.md`, plus parse/validate helpers. The catalog is the
 *    product-quality oracle for the recovery benchmark: every product is
 *    imported from a licensed public dataset and normalized deterministically,
 *    never invented by an LLM.
 *
 * 2. **Deterministic generation** — the pure, network-free pipeline
 *    (`mulberry32`, `selectRows`, `generateCatalog`) that the importer script
 *    (`scripts/import-catalog.ts`) drives. It lives here (rather than in the
 *    script) so tests can exercise selection determinism on tiny in-memory
 *    inputs without any network access.
 *
 * The `_provenance` object records, per product, which fields were generated
 * (rather than sourced from the dataset) and whether the product is an
 * adversarial fixture. It is the audit trail that lets generated content be
 * reverted or re-derived independently of the deterministic base.
 */

// ============================================================================
// Schemas
// ============================================================================

/**
 * A single purchasable variant of a product (size/color/option combination).
 *
 * `options` is a list of `{ name, value }` pairs (e.g. `{ name: "Size",
 * value: "M" }`). `available` is the stock state; the importer deliberately
 * marks ~8% of variants out-of-stock to exercise availability handling.
 */
export const CatalogVariantSchema = z.object({
  variantId: z.string(),
  sku: z.string(),
  options: z.array(z.object({ name: z.string(), value: z.string() })),
  price: z.number(),
  available: z.boolean(),
});
export type CatalogVariant = z.infer<typeof CatalogVariantSchema>;

/**
 * Per-product generation provenance.
 *
 * `generated` records which fields were synthesized by the deterministic
 * importer (fixed seed) rather than sourced from the dataset. `adversarial`
 * and `adversarialKind` mark deliberately difficult fixtures (near-titles and
 * cross-category echo titles) so tests and the benchmark can recognize them.
 */
export const CatalogProvenanceSchema = z.object({
  source: z.string(),
  sourceSplit: z.enum(["train", "test"]),
  sourceRowIndex: z.number(),
  generated: z.object({
    price: z.boolean(),
    availability: z.boolean(),
    variants: z.boolean(),
    sku: z.boolean(),
    title: z.boolean(),
  }),
  adversarial: z.boolean(),
  adversarialKind: z.string().nullable(),
  seed: z.number(),
});
export type CatalogProvenance = z.infer<typeof CatalogProvenanceSchema>;

/**
 * A normalized catalog product.
 *
 * `categoryPath` is the `ground_truth_category` split on `" > "` (top-level
 * category first). `imageUrls` holds the real dataset image URL(s); it is
 * empty when the source product has no image. `variants` always has at least
 * one entry (apparel products carry a 2-6 size run).
 */
export const CatalogProductSchema = z.object({
  productId: z.string(),
  title: z.string(),
  description: z.string(),
  brand: z.string(),
  categoryPath: z.array(z.string()),
  price: z.number(),
  currency: z.string(),
  imageUrls: z.array(z.string()),
  variants: z.array(CatalogVariantSchema),
  _provenance: CatalogProvenanceSchema,
});
export type CatalogProduct = z.infer<typeof CatalogProductSchema>;

// ============================================================================
// Parse / validate helpers
// ============================================================================

/** Parse and validate a single product, throwing on malformed input. */
export function parseCatalogProduct(input: unknown): CatalogProduct {
  return CatalogProductSchema.parse(input);
}

/** Parse and validate a single product, returning a safe-parse result. */
export function parseCatalogProductSafe(
  input: unknown,
): z.SafeParseReturnType<unknown, CatalogProduct> {
  return CatalogProductSchema.safeParse(input);
}

/** Parse and validate a single variant, throwing on malformed input. */
export function parseCatalogVariant(input: unknown): CatalogVariant {
  return CatalogVariantSchema.parse(input);
}

/** Parse and validate a single variant, returning a safe-parse result. */
export function parseCatalogVariantSafe(
  input: unknown,
): z.SafeParseReturnType<unknown, CatalogVariant> {
  return CatalogVariantSchema.safeParse(input);
}

/**
 * Whether a product is an adversarial fixture (near-title or cross-category
 * echo title). Adversarial products are deliberately difficult and must be
 * recognized by tests and the benchmark.
 */
export function isAdversarial(product: CatalogProduct): boolean {
  return product._provenance.adversarial === true;
}

/** The adversarial kind of a product, or `null` when it is not adversarial. */
export function adversarialKind(product: CatalogProduct): string | null {
  return product._provenance.adversarialKind;
}

// ============================================================================
// Deterministic generation (pure — no network, no time, no Math.random)
// ============================================================================

export const CATALOG_SEED = 20260821;
export const TARGET_PRODUCT_COUNT = 10_000;
export const DEV_FIXTURE_COUNT = 500;
export const DEV_FIXTURE_APPAREL_QUOTA = 0.4;
export const ADVERSARIAL_COUNT = 150;
export const OUT_OF_STOCK_RATE = 0.08;

export const APPAREL_CATEGORY = "Apparel & Accessories";

/** A normalized source row from the dataset (network-free input to the importer). */
export interface SourceRow {
  split: "train" | "test";
  rowIndex: number;
  title: string;
  description: string;
  brand: string;
  categoryPath: string[];
  imageUrl: string | null;
}

/**
 * mulberry32 — a small, fast, deterministic 32-bit PRNG. Given the same seed
 * it produces the same sequence of floats in [0, 1) on every machine.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** In-place Fisher-Yates shuffle driven by a deterministic PRNG. */
function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** Top-level category (first segment of the category path). */
export function topLevelCategory(categoryPath: string[]): string {
  return categoryPath[0] ?? "Uncategorized";
}

/**
 * Deterministic selection of `targetCount` rows.
 *
 * All apparel rows are kept (strong apparel representation), then the
 * remaining slots are filled round-robin across the other top-level
 * categories (each category's rows are first shuffled deterministically) so
 * the catalog stays broad enough for non-trivial ranking decisions.
 */
export function selectRows(
  rows: SourceRow[],
  targetCount: number,
  rng: () => number,
): SourceRow[] {
  const apparel = rows.filter(
    (r) => topLevelCategory(r.categoryPath) === APPAREL_CATEGORY,
  );
  const nonApparel = rows.filter(
    (r) => topLevelCategory(r.categoryPath) !== APPAREL_CATEGORY,
  );

  const byCategory = new Map<string, SourceRow[]>();
  for (const r of nonApparel) {
    const cat = topLevelCategory(r.categoryPath);
    const list = byCategory.get(cat);
    if (list) list.push(r);
    else byCategory.set(cat, [r]);
  }
  for (const list of byCategory.values()) shuffle(list, rng);

  const categories = [...byCategory.keys()].sort();
  const selected: SourceRow[] = [...apparel];

  let i = 0;
  while (selected.length < targetCount && categories.length > 0) {
    const cat = categories[i % categories.length];
    const list = byCategory.get(cat)!;
    if (list.length > 0) selected.push(list.shift()!);
    i++;
    // Safety valve: never loop forever if categories are exhausted.
    if (i > targetCount * categories.length) break;
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Generated-field data tables (data, not code)
// ---------------------------------------------------------------------------

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

const NEAR_TITLE_SUFFIXES = [
  "Pro",
  "Classic",
  "Deluxe",
  "Premium",
  "Lite",
  "Plus",
  "Max",
  "Essential",
  "Signature",
  "Original",
];

const CROSS_CATEGORY_ECHO_WORDS = [
  "Running",
  "Yoga",
  "Hiking",
  "Wedding",
  "Office",
  "Winter",
  "Summer",
  "Kids",
  "Pet",
  "Travel",
  "Gym",
  "Formal",
  "Casual",
  "Outdoor",
  "Beach",
];

/** Price ranges (USD) per top-level category; fallback for unknown categories. */
const PRICE_RANGES: Record<string, [number, number]> = {
  "Apparel & Accessories": [15, 300],
  "Home & Garden": [10, 500],
  Electronics: [20, 2000],
  "Sports & Outdoors": [15, 400],
  "Toys & Games": [5, 150],
  "Beauty & Personal Care": [5, 200],
  "Health & Beauty": [5, 200],
  "Food & Beverages": [3, 100],
  "Office Supplies": [5, 300],
  Automotive: [10, 500],
  "Pet Supplies": [5, 200],
  "Luggage & Bags": [20, 500],
  "Jewelry & Watches": [20, 2000],
  "Arts & Entertainment": [5, 300],
  Hardware: [5, 300],
  Software: [10, 500],
  "Cameras & Optics": [50, 3000],
  Media: [5, 100],
  "Musical Instruments": [20, 2000],
  "Sporting Goods": [15, 400],
  "Vehicles & Parts": [20, 2000],
  "Baby & Toddler": [5, 150],
  "Business & Industrial": [20, 1000],
  Furniture: [50, 2000],
  Weapons: [20, 1000],
  Tobacco: [5, 100],
  "E-Cigarettes & Vaporizers": [10, 200],
  "Duty & Tax Free": [10, 500],
  "Religious & Ceremonial": [5, 200],
  Mature: [5, 100],
  Adult: [5, 100],
  Unknown: [10, 200],
};

const DEFAULT_PRICE_RANGE: [number, number] = [10, 500];

function priceRange(categoryPath: string[]): [number, number] {
  return PRICE_RANGES[topLevelCategory(categoryPath)] ?? DEFAULT_PRICE_RANGE;
}

function generatePrice(categoryPath: string[], rng: () => number): number {
  const [min, max] = priceRange(categoryPath);
  return Math.round((min + rng() * (max - min)) * 100) / 100;
}

function generateSku(
  split: string,
  rowIndex: number,
  variantIndex: number,
): string {
  return `SKU-${split.toUpperCase()}-${String(rowIndex).padStart(5, "0")}-${String(
    variantIndex,
  ).padStart(2, "0")}`;
}

function applyAdversarialTitle(
  title: string,
  kind: "near-title" | "cross-category-echo",
  rng: () => number,
): string {
  if (kind === "near-title") {
    const suffix =
      NEAR_TITLE_SUFFIXES[Math.floor(rng() * NEAR_TITLE_SUFFIXES.length)];
    return `${title} ${suffix}`;
  }
  const word =
    CROSS_CATEGORY_ECHO_WORDS[
      Math.floor(rng() * CROSS_CATEGORY_ECHO_WORDS.length)
    ];
  return `${word} ${title}`;
}

function generateProduct(
  row: SourceRow,
  rng: () => number,
  isAdversarial: boolean,
  kind: "near-title" | "cross-category-echo" | null,
): CatalogProduct {
  const productId = `p_${row.split}_${row.rowIndex}`;
  const isApparel = topLevelCategory(row.categoryPath) === APPAREL_CATEGORY;

  const price = generatePrice(row.categoryPath, rng);

  // Apparel products get a 2-6 size run; everything else gets a single variant.
  const variantCount = isApparel ? 2 + Math.floor(rng() * 5) : 1;
  const variants = [];
  for (let v = 0; v < variantCount; v++) {
    const variantId = `${productId}_v${v}`;
    const sku = generateSku(row.split, row.rowIndex, v);
    const options = isApparel ? [{ name: "Size", value: SIZES[v] }] : [];
    const available = rng() >= OUT_OF_STOCK_RATE;
    variants.push({ variantId, sku, options, price, available });
  }

  const title =
    isAdversarial && kind ? applyAdversarialTitle(row.title, kind, rng) : row.title;

  return {
    productId,
    title,
    description: row.description,
    brand: row.brand,
    categoryPath: row.categoryPath,
    price,
    currency: "USD",
    imageUrls: row.imageUrl ? [row.imageUrl] : [],
    variants,
    _provenance: {
      source: `Shopify/product-catalogue:${row.split}:${row.rowIndex}`,
      sourceSplit: row.split,
      sourceRowIndex: row.rowIndex,
      generated: {
        price: true,
        availability: true,
        variants: isApparel,
        sku: true,
        title: isAdversarial,
      },
      adversarial: isAdversarial,
      adversarialKind: kind,
      seed: CATALOG_SEED,
    },
  };
}

/**
 * Full deterministic pipeline: select rows, mark adversarial fixtures, and
 * generate every product. Pure — no network, no time, no `Math.random`.
 */
export function generateCatalog(
  rows: SourceRow[],
  targetCount: number,
  seed: number,
): CatalogProduct[] {
  const rng = mulberry32(seed);
  const selected = selectRows(rows, targetCount, rng);

  // Deterministically choose which selected products are adversarial.
  const indices = Array.from({ length: selected.length }, (_, i) => i);
  shuffle(indices, rng);
  const adversarialSet = new Set(indices.slice(0, ADVERSARIAL_COUNT));

  return selected.map((row, i) => {
    const isAdversarial = adversarialSet.has(i);
    const kind = isAdversarial
      ? rng() < 0.5
        ? "near-title"
        : "cross-category-echo"
      : null;
    return generateProduct(row, rng, isAdversarial, kind);
  });
}

/**
 * Deterministic selection of the ~500-product dev fixture.
 *
 * Unlike the full catalog (which keeps all apparel first), the dev fixture is
 * selected with a bounded apparel quota plus round-robin samples from the
 * other top-level categories, so it exercises ranking across real product
 * categories and genuine cross-category distractors rather than a single
 * category. Adversarial products are retained so the fixture still exercises
 * adversarial recognition.
 */
export function selectDevFixture(
  products: CatalogProduct[],
  count: number,
  rng: () => number,
): CatalogProduct[] {
  const apparel = products.filter(
    (p) => topLevelCategory(p.categoryPath) === APPAREL_CATEGORY,
  );
  const nonApparel = products.filter(
    (p) => topLevelCategory(p.categoryPath) !== APPAREL_CATEGORY,
  );

  const byCategory = new Map<string, CatalogProduct[]>();
  for (const p of nonApparel) {
    const cat = topLevelCategory(p.categoryPath);
    const list = byCategory.get(cat);
    if (list) list.push(p);
    else byCategory.set(cat, [p]);
  }
  for (const list of byCategory.values()) shuffle(list, rng);

  const categories = [...byCategory.keys()].sort();

  const apparelQuota = Math.floor(count * DEV_FIXTURE_APPAREL_QUOTA);
  const selected: CatalogProduct[] = apparel.slice(0, apparelQuota);

  let i = 0;
  let remaining = nonApparel.length;
  while (selected.length < count && remaining > 0) {
    const cat = categories[i % categories.length];
    const list = byCategory.get(cat)!;
    if (list.length > 0) {
      selected.push(list.shift()!);
      remaining--;
    }
    i++;
    // Safety valve: never loop forever if categories are exhausted.
    if (i > count * categories.length) break;
  }

  // Fallback: if non-apparel is exhausted before reaching `count`, fill the
  // remainder from the remaining apparel products.
  if (selected.length < count) {
    const selectedIds = new Set(selected.map((p) => p.productId));
    for (const p of apparel) {
      if (selected.length >= count) break;
      if (!selectedIds.has(p.productId)) selected.push(p);
    }
  }

  // Ensure adversarial products are represented so the fixture exercises
  // adversarial recognition. If the selection missed them, swap in the first
  // adversarial product deterministically.
  if (!selected.some((p) => p._provenance.adversarial)) {
    const adversarial = products.find((p) => p._provenance.adversarial);
    if (adversarial) selected[selected.length - 1] = adversarial;
  }

  return selected;
}
