import type { CatalogProduct, CatalogVariant } from "../catalog/schema.js";
import type { ShopperConstraint } from "../domain/schemas.js";

/**
 * Stable commerce-platform interfaces (docs/PLAN_FINAL.md §3.9).
 *
 * The domain must not depend directly on Shopify. These interfaces are the
 * seam the storefront and the recovery domain code against:
 *
 *   - `CatalogAdapter`  — read-only catalog truth (search, list, product,
 *     variant lookup). The adapter is authoritative over product/variant
 *     existence; the LLM may only select IDs already returned by it.
 *   - `CommerceAdapter` — cart and checkout actions.
 *   - `OrderAdapter`    — normalize a paid-order webhook payload into a
 *     platform-independent order.
 *   - `SearchAdapter`   — optional; a dedicated search backend when the
 *     catalog adapter does not provide its own ranking.
 *
 * Every implementation must be typed against `src/catalog/schema.ts`
 * (`CatalogProduct` / `CatalogVariant`) and `src/domain/schemas.ts`
 * (`ShopperConstraint`), so a Shopify product and a stress-test product are
 * interchangeable at the boundary.
 */

/** A single ranked search result: a catalog product plus a relevance score. */
export interface SearchResult {
  product: CatalogProduct;
  /** Relevance score in [0, 1]; higher is more relevant. */
  score: number;
}

/**
 * Read-only catalog access. Implementations must never invent products: every
 * returned product/variant ID must be resolvable through the same adapter
 * (the "closed-universe" property).
 */
export interface CatalogAdapter {
  /**
   * Lexical/ranked search over the catalog. `constraints` (when provided) are
   * applied as hard filters (e.g. `price_max`, `category`) before ranking.
   */
  search(
    query: string,
    constraints?: ShopperConstraint[],
  ): Promise<SearchResult[]>;

  /** All products in the catalog (the adapter's closed universe). */
  listProducts(): Promise<CatalogProduct[]>;

  /** A single product by ID, or `null` when it does not exist. */
  getProduct(id: string): Promise<CatalogProduct | null>;

  /** A single variant by product + variant ID, or `null` when it does not exist. */
  getVariant(
    productId: string,
    variantId: string,
  ): Promise<CatalogVariant | null>;
}

/** A single cart line (product + variant + quantity). */
export interface CartLine {
  productId: string;
  variantId: string;
  quantity: number;
}

/** The result of adding a variant to a cart. */
export interface CartResult {
  cartId: string;
  lines: CartLine[];
}

/**
 * Cart and checkout actions. `addToCart` must reject unavailable variants
 * rather than silently adding them.
 */
export interface CommerceAdapter {
  /**
   * Add a variant to a cart. Throws when the product/variant does not exist
   * or the variant is unavailable.
   */
  addToCart(productId: string, variantId: string): Promise<CartResult>;

  /** Resolve a checkout URL for a previously created cart. */
  getCheckoutUrl(cartId: string): Promise<string>;
}

/** A single normalized order line. */
export interface NormalizedOrderLine {
  productId: string;
  variantId: string;
  quantity: number;
  price: number;
}

/** A platform-independent paid order. */
export interface NormalizedOrder {
  orderId: string;
  storeId: string;
  lines: NormalizedOrderLine[];
  total: number;
  currency: string;
  paidAt: string;
}

/**
 * Normalize a paid-order webhook payload into a platform-independent order.
 * Implementations must reject malformed payloads rather than fabricate order
 * data.
 */
export interface OrderAdapter {
  parseOrderPaid(payload: unknown): NormalizedOrder;
}

/**
 * Optional dedicated search backend. When a platform provides its own search
 * index, this adapter exposes it; otherwise the `CatalogAdapter.search`
 * implementation is used.
 */
export interface SearchAdapter {
  search(query: string): Promise<SearchResult[]>;
}
