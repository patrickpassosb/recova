import type { CatalogProduct, CatalogVariant } from "../catalog/schema.js";
import type { CatalogCandidate } from "../domain/cards.js";
import { stripPlural } from "../domain/constraints.js";

/**
 * Bridge between the catalog adapter's `CatalogProduct`/`CatalogVariant`
 * shapes and the domain solver's `CatalogCandidate` shape.
 *
 * The domain solver (W04) reasons over `CatalogCandidate.attributes`
 * (`category`, `size`, `color`, `compatibility`, `intendedUse`). The catalog
 * adapter (W06) exposes `CatalogProduct` with a `categoryPath` and per-variant
 * `options`. This module is the deterministic, LLM-free mapping between the
 * two: it never invents evidence, and any attribute the catalog does not carry
 * is left `undefined` so the solver treats it as *unknown* rather than
 * silently satisfied.
 */

/**
 * Leaf-category → canonical-category mapping for the stress-test catalog.
 *
 * The domain solver matches `category` exactly against the canonical values
 * produced by `extractConstraints` (see `CATEGORY_SYNONYMS` in
 * `src/domain/constraints.ts`). The catalog's leaf categories are far more
 * specific ("Panama Hats", "Cargo Pants", "Maternity Skirts"), so this table
 * normalizes them to the canonical category the solver understands. Categories
 * not listed here fall back to a slugified leaf (which will not match any
 * extracted constraint and is therefore correctly rejected as a category
 * violation rather than silently upgraded).
 */
const CATEGORY_MAP: Record<string, string> = {
  // dresses
  dresses: "dress",
  "wedding dresses": "dress",
  "bridal party dresses": "dress",
  "wedding & bridal party dresses": "dress",
  "swim dresses": "dress",
  "maternity one-pieces": "dress",
  "one-pieces": "dress",
  // hats
  "panama hats": "hat",
  "bucket hats": "hat",
  "sun hats": "hat",
  "trucker hats": "hat",
  "winter hats": "hat",
  fedoras: "hat",
  trilbies: "hat",
  beanies: "hat",
  headwear: "hat",
  balaclavas: "hat",
  // shoes
  sandals: "shoes",
  "costume shoes": "shoes",
  "baby & toddler shoes": "shoes",
  "baby & toddler boots": "shoes",
  // pants
  "cargo pants": "pants",
  "maternity pants": "pants",
  "track pants": "pants",
  sweatpants: "pants",
  joggers: "pants",
  chinos: "pants",
  jeans: "pants",
  denim: "pants",
  cargos: "pants",
  "snow pants & suits": "pants",
  "contractor pants & coveralls": "pants",
  // shirts
  shirts: "shirt",
  blouses: "shirt",
  polos: "shirt",
  overshirts: "shirt",
  "nursing shirts": "shirt",
  "t-shirts": "t-shirt",
  "loungewear tops": "shirt",
  "clothing tops": "shirt",
  // skirts
  skirts: "skirt",
  "maternity skirts": "skirt",
  skorts: "skirt",
  // sweaters
  sweaters: "sweater",
  // hoodies
  sweatshirts: "hoodie",
  windbreakers: "hoodie",
  fleece: "hoodie",
  // jackets
  jackets: "jacket",
  "bomber jackets": "jacket",
  "bolero jackets": "jacket",
  "puffer jackets": "jacket",
  parkas: "jacket",
  "rain coats": "jacket",
  "trench coats": "jacket",
  "track jackets": "jacket",
  "sport jackets": "jacket",
  "white coats": "jacket",
  capes: "jacket",
  // swimwear
  swimwear: "swimsuit",
  "one-piece swimsuits": "swimsuit",
  "swimwear tops": "swimsuit",
  "rash guards": "swimsuit",
  "swim trunks": "swimsuit",
  "swim boxers": "swimsuit",
  "swim briefs": "swimsuit",
  // shorts
  "cargo shorts": "shorts",
  "chino shorts": "shorts",
  "boxing shorts": "shorts",
  "legging shorts": "shorts",
  // socks
  socks: "socks",
  "athletic socks": "socks",
  "knee socks": "socks",
  "dance socks": "socks",
  "baby & toddler socks & tights": "socks",
  hosiery: "socks",
  tights: "socks",
  pantyhose: "socks",
  // bags
  backpacks: "bag",
  handbags: "bag",
  "tote bags": "bag",
  "duffel bags": "bag",
  "messenger bags": "bag",
  "beach bags": "bag",
  "shopper bags": "bag",
  "barrel bags": "bag",
  "half-moon bags": "bag",
  "wrist bags": "bag",
  "baguette handbags": "bag",
  "hiking backpacks": "bag",
  "military backpacks": "bag",
  "school bags": "bag",
  "travel organizer bags": "bag",
  "garment bags": "bag",
  "doctor bags": "bag",
  "lens bags": "bag",
  "camera shoulder bags": "bag",
  "coin purses": "bag",
  "luggage accessories": "bag",
  "handbags, wallets & cases": "bag",
  // belts
  "maternity belts & support bands": "belt",
  "hockey suspenders & belts": "belt",
  // scarves
  "pet scarves": "scarf",
  // suits
  suits: "suit",
  "skirt suits": "suit",
  tuxedos: "suit",
  "military uniforms": "suit",
  "school uniforms": "suit",
  "sports uniforms": "suit",
  uniforms: "suit",
  "food service uniforms": "suit",
  scrubs: "suit",
  // watches
  "watch winders": "watch",
  "watch stickers & decals": "watch",
};

/** Normalize a catalog leaf category to the canonical category the solver uses. */
export function canonicalCategory(categoryPath: string[]): string {
  const leaf = (categoryPath[categoryPath.length - 1] ?? "").toLowerCase().trim();
  if (leaf in CATEGORY_MAP) return CATEGORY_MAP[leaf];
  const slug = leaf.replace(/[^a-z0-9]+/g, " ").trim();
  if (slug in CATEGORY_MAP) return CATEGORY_MAP[slug];
  const singular = stripPlural(slug);
  if (singular in CATEGORY_MAP) return CATEGORY_MAP[singular];
  return slug;
}

/** Synthesize a URL-safe handle from a product title (the catalog has no handle). */
export function synthesizeHandle(title: string, productId: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : productId;
}

/** Read a single option value by name from a variant's options list. */
function optionValue(
  variant: CatalogVariant,
  name: string,
): string | undefined {
  const opt = variant.options.find(
    (o) => o.name.toLowerCase() === name.toLowerCase(),
  );
  return opt?.value;
}

/**
 * Map a single product + variant to a domain `CatalogCandidate`.
 *
 * `category` is normalized from the product's `categoryPath`; `size` and
 * `color` are read from the variant's options when present. `compatibility`
 * and `intendedUse` are not carried by the stress-test catalog and are left
 * `undefined` (unknown evidence).
 */
export function toCatalogCandidate(
  product: CatalogProduct,
  variant: CatalogVariant,
): CatalogCandidate {
  return {
    productId: product.productId,
    variantId: variant.variantId,
    handle: synthesizeHandle(product.title, product.productId),
    title: product.title,
    imageUrl: product.imageUrls[0] ?? null,
    price: variant.price,
    available: variant.available,
    selectedOptions: variant.options.map((o) => ({
      name: o.name,
      value: o.value,
    })),
    attributes: {
      category: canonicalCategory(product.categoryPath),
      size: optionValue(variant, "Size"),
      color: optionValue(variant, "Color"),
      compatibility: undefined,
      intendedUse: undefined,
    },
  };
}

/**
 * Expand a list of catalog products into domain candidates, one per variant.
 *
 * The solver selects a specific variant (e.g. the "M" size run) for each
 * Decision Card, so every variant must be a distinct candidate.
 */
export function toCatalogCandidates(
  products: CatalogProduct[],
): CatalogCandidate[] {
  const out: CatalogCandidate[] = [];
  for (const product of products) {
    for (const variant of product.variants) {
      out.push(toCatalogCandidate(product, variant));
    }
  }
  return out;
}
