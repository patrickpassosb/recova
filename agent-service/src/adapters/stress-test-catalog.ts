import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CatalogProduct, CatalogVariant } from "../catalog/schema.js";
import { parseCatalogProduct } from "../catalog/schema.js";
import type { ShopperConstraint } from "../domain/schemas.js";
import type {
  CartResult,
  CatalogAdapter,
  CommerceAdapter,
  SearchResult,
} from "./interfaces.js";

/**
 * Recova stress-test catalog adapter (docs/PLAN_FINAL.md §3.4, §3.9).
 *
 * Implements `CatalogAdapter` + `CommerceAdapter` over the deterministic
 * stress-test catalog (`catalog/fixtures/catalog.dev.jsonl`, or the full
 * `catalog/data/catalog.jsonl` when present). It is the storefront's primary
 * catalog source: the ~10,000 products do not need to exist inside Shopify.
 *
 * Properties:
 *   - **load once** — the JSONL is read and indexed by `productId` on first
 *     use, then cached for the lifetime of the adapter.
 *   - **stateless catalog** — search/list/get never mutate catalog state.
 *   - **lexical search** — title + description + brand + category token-overlap
 *     scoring (see `lexicalSearch`).
 *   - **in-memory demo cart** — `addToCart` validates existence + availability
 *     and records a demo cart; `getCheckoutUrl` returns a local checkout URL.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "for", "with", "of", "to", "in", "on", "at",
  "is", "are", "was", "were", "be", "been", "this", "that", "these", "those",
  "it", "its", "i", "you", "we", "they", "he", "she", "my", "your", "our",
  "their", "me", "him", "her", "us", "them", "do", "does", "did", "have",
  "has", "had", "can", "could", "would", "should", "will", "shall", "may",
  "might", "must", "not", "no", "yes", "from", "by", "as", "but", "if",
  "then", "than", "so", "what", "which", "who", "whom", "when", "where",
  "why", "how", "all", "any", "both", "each", "few", "more", "most", "other",
  "some", "such", "only", "own", "same", "too", "very", "just", "about",
  "into", "over", "under", "again", "further", "once", "here", "there", "up",
  "down", "out", "off", "new", "old", "good", "great", "best", "want",
  "need", "looking", "look", "get", "buy", "purchase", "please", "like",
  "love", "size", "color", "colour", "price", "under", "less", "than", "max",
  "minimum", "maximum", "up", "to",
]);

/** Lowercase, strip accents, and split into alphanumeric tokens. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1);
}

/** Whether a query token matches a haystack token (exact or prefix overlap). */
function tokenMatches(queryToken: string, haystackToken: string): boolean {
  if (queryToken === haystackToken) return true;
  if (queryToken.length >= 4 && haystackToken.length >= 4) {
    return (
      haystackToken.startsWith(queryToken) ||
      queryToken.startsWith(haystackToken)
    );
  }
  return false;
}

/** Apply hard constraint filters (price_max, category) before ranking. */
function passesConstraints(
  product: CatalogProduct,
  constraints?: ShopperConstraint[],
): boolean {
  if (!constraints || constraints.length === 0) return true;
  for (const c of constraints) {
    if (c.kind === "price_max" && product.price > Number(c.value)) {
      return false;
    }
    if (c.kind === "category") {
      const cat = String(c.value).toLowerCase();
      const path = product.categoryPath.map((s) => s.toLowerCase());
      const hit = path.some(
        (seg) => seg === cat || seg.includes(cat) || cat.includes(seg),
      );
      if (!hit) return false;
    }
  }
  return true;
}

/**
 * Simple lexical search over title + description + brand + category, scored by
 * token overlap (fraction of query tokens that matched). Exported so the
 * Shopify adapter can reuse the same ranking without duplicating it.
 */
export function lexicalSearch(
  products: CatalogProduct[],
  query: string,
  constraints?: ShopperConstraint[],
): SearchResult[] {
  const queryTokens = tokenize(query).filter((t) => !STOPWORDS.has(t));
  if (queryTokens.length === 0) return [];

  const results: SearchResult[] = [];
  for (const product of products) {
    if (!passesConstraints(product, constraints)) continue;
    const haystack = tokenize(
      [
        product.title,
        product.description,
        product.brand,
        product.categoryPath.join(" "),
      ].join(" "),
    );
    let hits = 0;
    for (const qt of queryTokens) {
      if (haystack.some((ht) => tokenMatches(qt, ht))) hits++;
    }
    if (hits === 0) continue;
    results.push({ product, score: hits / queryTokens.length });
  }

  results.sort(
    (a, b) => b.score - a.score || a.product.price - b.product.price,
  );
  return results;
}

/** Resolve the default catalog path: full catalog when present, else dev fixture. */
export function defaultCatalogPath(): string {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const full = resolve(repoRoot, "catalog/data/catalog.jsonl");
  if (existsSync(full)) return full;
  return resolve(repoRoot, "catalog/fixtures/catalog.dev.jsonl");
}

export interface StressTestCatalogOptions {
  /** Override the catalog JSONL path (defaults to full catalog → dev fixture). */
  catalogPath?: string;
  /** Base URL for the local demo checkout link. */
  checkoutBaseUrl?: string;
}

export class StressTestCatalogAdapter
  implements CatalogAdapter, CommerceAdapter
{
  private products: CatalogProduct[] | null = null;
  private byId: Map<string, CatalogProduct> | null = null;
  private readonly carts = new Map<string, CartResult>();
  private cartCounter = 0;
  private readonly catalogPath: string;
  private readonly checkoutBaseUrl: string;

  constructor(options: StressTestCatalogOptions = {}) {
    this.catalogPath = options.catalogPath ?? defaultCatalogPath();
    this.checkoutBaseUrl = options.checkoutBaseUrl ?? "http://localhost:8080";
  }

  private load(): {
    products: CatalogProduct[];
    byId: Map<string, CatalogProduct>;
  } {
    if (this.products && this.byId) {
      return { products: this.products, byId: this.byId };
    }
    const text = readFileSync(this.catalogPath, "utf8");
    const products = text
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => parseCatalogProduct(JSON.parse(line)));
    const byId = new Map(products.map((p) => [p.productId, p]));
    this.products = products;
    this.byId = byId;
    return { products, byId };
  }

  async search(
    query: string,
    constraints?: ShopperConstraint[],
  ): Promise<SearchResult[]> {
    return lexicalSearch(this.load().products, query, constraints);
  }

  async listProducts(): Promise<CatalogProduct[]> {
    return this.load().products;
  }

  async getProduct(id: string): Promise<CatalogProduct | null> {
    return this.load().byId.get(id) ?? null;
  }

  async getVariant(
    productId: string,
    variantId: string,
  ): Promise<CatalogVariant | null> {
    const product = this.load().byId.get(productId);
    if (!product) return null;
    return product.variants.find((v) => v.variantId === variantId) ?? null;
  }

  async addToCart(
    productId: string,
    variantId: string,
  ): Promise<CartResult> {
    const product = this.load().byId.get(productId);
    if (!product) throw new Error(`product ${productId} not found`);
    const variant = product.variants.find((v) => v.variantId === variantId);
    if (!variant) {
      throw new Error(`variant ${variantId} not found for product ${productId}`);
    }
    if (!variant.available) {
      throw new Error(`variant ${variantId} is unavailable`);
    }
    const cartId = `cart_${++this.cartCounter}`;
    const result: CartResult = {
      cartId,
      lines: [{ productId, variantId, quantity: 1 }],
    };
    this.carts.set(cartId, result);
    return result;
  }

  async getCheckoutUrl(cartId: string): Promise<string> {
    if (!this.carts.has(cartId)) {
      throw new Error(`cart ${cartId} not found`);
    }
    return `${this.checkoutBaseUrl}/checkout/${cartId}`;
  }
}
