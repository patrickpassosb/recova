import type { CatalogProduct, CatalogVariant } from "../catalog/schema.js";
import { CATALOG_SEED } from "../catalog/schema.js";
import type { ShopperConstraint } from "../domain/schemas.js";
import type {
  CartResult,
  CatalogAdapter,
  CommerceAdapter,
  SearchResult,
} from "./interfaces.js";
import { lexicalSearch } from "./stress-test-catalog.js";

/**
 * Shopify Storefront API adapter (ported from the V1 `mcp-app/api/lib/shopify.ts`
 * pattern, docs/PLAN_FINAL.md §3.9).
 *
 * Unlike V1, the endpoint and storefront access token are **config-injected**
 * and never hardcoded. The adapter maps Storefront API products/variants into
 * the shared `CatalogProduct` / `CatalogVariant` shapes (with `selectedOptions`
 * parsed into `options`), and implements `CommerceAdapter` via the Storefront
 * `cartCreate` / `checkoutCreate` mutations.
 *
 * This is a separate adapter path, not the system of record for the 10k
 * stress-test catalog.
 */

export interface ShopifyConfig {
  /** Storefront GraphQL endpoint, e.g. `https://{store}.myshopify.com/api/2024-01/graphql.json`. */
  endpoint: string;
  /** Storefront access token (public by design, but still injected, never hardcoded). */
  storefrontAccessToken: string;
}

const CATALOG_QUERY = `query Catalog {
  products(first: 100) {
    edges {
      node {
        id
        title
        handle
        description
        vendor
        productType
        priceRange { minVariantPrice { amount currencyCode } }
        featuredImage { url }
        variants(first: 100) {
          edges {
            node {
              id
              sku
              price { amount currencyCode }
              availableForSale
              selectedOptions { name value }
            }
          }
        }
      }
    }
  }
}`;

const CART_CREATE_QUERY = `mutation cartCreate($input: CartInput!) {
  cartCreate(input: $input) {
    cart {
      id
      lines(first: 10) {
        edges { node { id quantity merchandise { ... on ProductVariant { id } } } }
      }
    }
  }
}`;

const CHECKOUT_CREATE_QUERY = `mutation checkoutCreate($input: CheckoutCreateInput!) {
  checkoutCreate(input: $input) {
    checkout { webUrl }
  }
}`;

interface GraphQlResponse {
  data?: unknown;
  errors?: Array<{ message: string }>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function mapVariant(node: Record<string, unknown>): CatalogVariant {
  const selectedOptions = (node.selectedOptions ??
    []) as Array<{ name?: string; value?: string }>;
  const price = asRecord(node.price);
  return {
    variantId: String(node.id ?? ""),
    sku: node.sku ? String(node.sku) : "",
    options: selectedOptions.map((o) => ({
      name: String(o.name ?? ""),
      value: String(o.value ?? ""),
    })),
    price: Number(price.amount ?? 0),
    available: Boolean(node.availableForSale),
  };
}

function mapProduct(node: Record<string, unknown>, index: number): CatalogProduct {
  const variants = (node.variants ?? {}) as {
    edges?: Array<{ node?: Record<string, unknown> }>;
  };
  const priceRange = asRecord(node.priceRange);
  const minVariantPrice = asRecord(priceRange.minVariantPrice);
  const featuredImage = node.featuredImage as { url?: string } | null;

  return {
    productId: String(node.id ?? ""),
    title: String(node.title ?? ""),
    description: node.description ? String(node.description) : "",
    brand: node.vendor ? String(node.vendor) : "",
    categoryPath: node.productType ? [String(node.productType)] : [],
    price: Number(minVariantPrice.amount ?? 0),
    currency: minVariantPrice.currencyCode
      ? String(minVariantPrice.currencyCode)
      : "USD",
    imageUrls: featuredImage?.url ? [featuredImage.url] : [],
    variants: (variants.edges ?? []).map(({ node: v }) =>
      mapVariant(asRecord(v)),
    ),
    _provenance: {
      source: `shopify:${String(node.id ?? "")}`,
      sourceSplit: "train",
      sourceRowIndex: index,
      generated: {
        price: false,
        availability: false,
        variants: false,
        sku: false,
        title: false,
      },
      adversarial: false,
      adversarialKind: null,
      seed: CATALOG_SEED,
    },
  };
}

export class ShopifyAdapter implements CatalogAdapter, CommerceAdapter {
  private products: CatalogProduct[] | null = null;
  private byId: Map<string, CatalogProduct> | null = null;
  private readonly carts = new Map<string, CartResult>();
  private readonly config: ShopifyConfig;

  constructor(config: ShopifyConfig) {
    if (!config.endpoint || !config.storefrontAccessToken) {
      throw new Error(
        "ShopifyAdapter requires a non-empty endpoint and access token",
      );
    }
    this.config = config;
  }

  private async gql(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<GraphQlResponse> {
    const res = await fetch(this.config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": this.config.storefrontAccessToken,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Storefront API failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as GraphQlResponse;
    if (json.errors && json.errors.length > 0) {
      throw new Error(`Storefront API error: ${json.errors[0].message}`);
    }
    return json;
  }

  private async load(): Promise<{
    products: CatalogProduct[];
    byId: Map<string, CatalogProduct>;
  }> {
    if (this.products && this.byId) {
      return { products: this.products, byId: this.byId };
    }
    const json = await this.gql(CATALOG_QUERY);
    const data = asRecord(json.data);
    const productsNode = asRecord(data.products);
    const edges = (productsNode.edges ?? []) as Array<{
      node?: Record<string, unknown>;
    }>;
    const products = edges.map(({ node }, i) => mapProduct(asRecord(node), i));
    const byId = new Map(products.map((p) => [p.productId, p]));
    this.products = products;
    this.byId = byId;
    return { products, byId };
  }

  async search(
    query: string,
    constraints?: ShopperConstraint[],
  ): Promise<SearchResult[]> {
    return lexicalSearch((await this.load()).products, query, constraints);
  }

  async listProducts(): Promise<CatalogProduct[]> {
    return (await this.load()).products;
  }

  async getProduct(id: string): Promise<CatalogProduct | null> {
    return (await this.load()).byId.get(id) ?? null;
  }

  async getVariant(
    productId: string,
    variantId: string,
  ): Promise<CatalogVariant | null> {
    const product = (await this.load()).byId.get(productId);
    if (!product) return null;
    return product.variants.find((v) => v.variantId === variantId) ?? null;
  }

  async addToCart(
    productId: string,
    variantId: string,
  ): Promise<CartResult> {
    const product = (await this.load()).byId.get(productId);
    if (!product) throw new Error(`product ${productId} not found`);
    const variant = product.variants.find((v) => v.variantId === variantId);
    if (!variant) {
      throw new Error(`variant ${variantId} not found for product ${productId}`);
    }
    if (!variant.available) {
      throw new Error(`variant ${variantId} is unavailable`);
    }

    const json = await this.gql(CART_CREATE_QUERY, {
      input: { lines: [{ merchandiseId: variantId, quantity: 1 }] },
    });
    const data = asRecord(json.data);
    const cartCreate = asRecord(data.cartCreate);
    const cart = asRecord(cartCreate.cart);
    const cartId = String(cart.id ?? "");
    const linesNode = asRecord(cart.lines);
    const edges = (linesNode.edges ?? []) as Array<{
      node?: Record<string, unknown>;
    }>;
    const lines = edges.map(({ node }) => {
      const n = asRecord(node);
      return {
        productId,
        variantId,
        quantity: Number(n.quantity ?? 1),
      };
    });

    const result: CartResult = { cartId, lines };
    this.carts.set(cartId, result);
    return result;
  }

  async getCheckoutUrl(cartId: string): Promise<string> {
    const cart = this.carts.get(cartId);
    if (!cart) throw new Error(`cart ${cartId} not found`);

    const json = await this.gql(CHECKOUT_CREATE_QUERY, {
      input: {
        lineItems: cart.lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
        })),
      },
    });
    const data = asRecord(json.data);
    const checkoutCreate = asRecord(data.checkoutCreate);
    const checkout = asRecord(checkoutCreate.checkout);
    return String(checkout.webUrl ?? "");
  }
}
