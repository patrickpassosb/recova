import { afterEach } from "bun:test";

/**
 * Test catalog fixture mirroring the Shopify Storefront API shape the
 * `fetchCatalog` loader parses. All ids/prices are deterministic.
 */
export const TEST_CATALOG = [
  { id: "gid://1", title: "High Top Canvas Shoes", handle: "high-top-canvas-shoes", price: 120, tags: ["calçado"], variantId: "gid://var-1" },
  { id: "gid://2", title: "Sneakers Runner", handle: "sneakers-runner", price: 300, tags: ["calçado"], variantId: "gid://var-2" },
  { id: "gid://3", title: "Canvas Shoes Slip", handle: "canvas-shoes-slip", price: 90, tags: ["calçado"], variantId: "gid://var-3" },
  { id: "gid://4", title: "Capy Sticker", handle: "capy-sticker", price: 15, tags: ["adesivo"], variantId: "gid://var-4" },
  { id: "gid://5", title: "Mug Coffee", handle: "mug-coffee", price: 45, tags: ["caneca"], variantId: "gid://var-5" },
  { id: "gid://6", title: "Eco Tote Bag", handle: "eco-tote-bag", price: 35, tags: ["bolsa"], variantId: "gid://var-6" },
  { id: "gid://7", title: "Pixel Perfection Pen", handle: "pen", price: 12, tags: ["caneta"], variantId: "gid://var-7" },
] as const;

/** Builds a Storefront API GraphQL response body for the test catalog. */
export function shopifyGraphqlResponse() {
  return JSON.stringify({
    data: {
      products: {
        edges: TEST_CATALOG.map((p) => ({
          node: {
            id: p.id,
            title: p.title,
            handle: p.handle,
            productType: null,
            tags: [...p.tags],
            priceRange: { minVariantPrice: { amount: String(p.price) } },
            featuredImage: null,
            variants: { edges: [{ node: { id: p.variantId } }] },
          },
        })),
      },
    },
  });
}

export interface LlmScenario {
  /** Raw content the LLM "returns" (should be JSON). */
  content?: string;
  /** Overrides status code of the LLM response. */
  status?: number;
  /** If true, respond with an HTTP error before reading body. */
  httpError?: boolean;
}

export interface StubOptions {
  /** When set, the LLM returns this scenario for every chat call. */
  llm?: LlmScenario;
  /** Override the catalog response status (e.g. to test fetchCatalog failure). */
  catalogStatus?: number;
}

const originalFetch = globalThis.fetch;

/**
 * Stubs `globalThis.fetch` to route the two real network boundaries the
 * agent uses:
 *  - Shopify Storefront API  (fetchCatalog)
 *  - Ollama LLM endpoint      (chat)
 *
 * This exercises the real parsing, synonyms, scoring and fallback logic
 * while keeping every call deterministic and offline. Returns a cleanup fn.
 */
export function stubNetwork(opts: StubOptions = {}): () => void {
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);

    if (url.includes("myshopify.com")) {
      if (opts.catalogStatus && opts.catalogStatus !== 200) {
        return new Response("catalog error", { status: opts.catalogStatus });
      }
      return new Response(shopifyGraphqlResponse(), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("ollama.com")) {
      if (opts.llm?.httpError) {
        return new Response("network error", { status: 503 });
      }
      if (opts.llm?.status && opts.llm.status !== 200) {
        return new Response("llm error", { status: opts.llm.status });
      }
      const content =
        opts.llm?.content ??
        JSON.stringify({
          terms: ["shoes", "canvas shoes"],
          category: "calçado",
          max_price: null,
          refinement_options: ["Casual", "Esportivo", "Dia a dia"],
        });
      return new Response(
        JSON.stringify({ choices: [{ message: { content } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    throw new Error(`Unexpected fetch in test: ${url}`);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

/**
 * Restores a stubbed fetch after each test. Import this once in a describe
 * block that uses `stubNetwork`.
 */
export function restoreFetchAfterEach(): void {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
}
