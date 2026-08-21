import assert from "node:assert/strict";
import { test } from "node:test";
import type { CatalogProduct } from "../catalog/schema.js";
import type { CatalogAdapter, CommerceAdapter } from "./interfaces.js";
import { StressTestCatalogAdapter, tokenize } from "./stress-test-catalog.js";
import { ShopifyAdapter } from "./shopify.js";

/**
 * Shared adapter contract suite (docs/PLAN_FINAL.md §3.9, W06).
 *
 * A single contract runner executes the SAME invariants against every adapter
 * in the table:
 *
 *   1. search returns in-catalog IDs only;
 *   2. getProduct / getVariant round-trip;
 *   3. unavailable variants cannot addToCart;
 *   4. closed-universe property (every listed product/variant is resolvable).
 *
 * The stress-test adapter runs always; the Shopify adapter is network-marked
 * and skipped unless `SHOPIFY_E2E=1`.
 */

interface AdapterPair {
  adapter: CatalogAdapter;
  commerce: CommerceAdapter;
}

/** Pick a search term guaranteed to match the first product's own title. */
function pickSearchTerm(products: CatalogProduct[]): string {
  for (const p of products) {
    const token = tokenize(p.title).find((t) => t.length >= 4);
    if (token) return token;
  }
  return products[0].title;
}

function contractSuite(
  name: string,
  makePair: () => AdapterPair,
  options: { skip?: boolean } = {},
): void {
  const t = (
    label: string,
    fn: (pair: AdapterPair) => Promise<void> | void,
  ): void => {
    test(`${name}: ${label}`, { skip: options.skip }, () => fn(makePair()));
  };

  t("search returns in-catalog IDs only", async ({ adapter }) => {
    const products = await adapter.listProducts();
    assert.ok(products.length > 0, "catalog is non-empty");
    const universe = new Set(products.map((p) => p.productId));

    const term = pickSearchTerm(products);
    const results = await adapter.search(term);
    assert.ok(results.length > 0, `search("${term}") returns results`);
    for (const r of results) {
      assert.ok(
        universe.has(r.product.productId),
        `search result ${r.product.productId} is in the catalog`,
      );
    }
    // The product whose title supplied the term must be among the results.
    assert.ok(
      results.some((r) => r.product.productId === products[0].productId),
      "the source product is returned for its own title term",
    );
  });

  t("getProduct/getVariant round-trip", async ({ adapter }) => {
    const products = await adapter.listProducts();
    const p = products[0];

    const got = await adapter.getProduct(p.productId);
    assert.ok(got, `getProduct(${p.productId}) resolves`);
    assert.equal(got.productId, p.productId);
    assert.equal(got.title, p.title);

    const v = p.variants[0];
    const gv = await adapter.getVariant(p.productId, v.variantId);
    assert.ok(gv, `getVariant(${p.productId}, ${v.variantId}) resolves`);
    assert.equal(gv.variantId, v.variantId);
    assert.equal(gv.sku, v.sku);

    // Negative: unknown IDs resolve to null, never throw or fabricate.
    assert.equal(await adapter.getProduct("does-not-exist"), null);
    assert.equal(await adapter.getVariant(p.productId, "does-not-exist"), null);
  });

  t("unavailable variants cannot addToCart", async ({ adapter, commerce }) => {
    const products = await adapter.listProducts();

    // Find an unavailable variant (the stress-test catalog marks ~8% OOS).
    let unavailable: { productId: string; variantId: string } | null = null;
    for (const p of products) {
      const v = p.variants.find((variant) => !variant.available);
      if (v) {
        unavailable = { productId: p.productId, variantId: v.variantId };
        break;
      }
    }

    if (unavailable) {
      await assert.rejects(
        () => commerce.addToCart(unavailable!.productId, unavailable!.variantId),
        /unavailable/,
        "unavailable variant is rejected",
      );
    }

    // Unknown variant is always rejected.
    await assert.rejects(
      () => commerce.addToCart(products[0].productId, "does-not-exist"),
      /not found/,
      "unknown variant is rejected",
    );

    // An available variant succeeds and yields a checkout URL.
    const p = products[0];
    const avail = p.variants.find((v) => v.available) ?? p.variants[0];
    const cart = await commerce.addToCart(p.productId, avail.variantId);
    assert.ok(cart.cartId.length > 0, "cart has an id");
    assert.equal(cart.lines.length, 1);
    assert.equal(cart.lines[0].variantId, avail.variantId);

    const url = await commerce.getCheckoutUrl(cart.cartId);
    assert.ok(url.length > 0, "checkout URL is non-empty");
  });

  t("closed-universe property", async ({ adapter }) => {
    const products = await adapter.listProducts();
    for (const p of products) {
      const got = await adapter.getProduct(p.productId);
      assert.ok(got, `getProduct(${p.productId}) resolves`);
      assert.equal(got.productId, p.productId);
      for (const v of p.variants) {
        const gv = await adapter.getVariant(p.productId, v.variantId);
        assert.ok(gv, `getVariant(${p.productId}, ${v.variantId}) resolves`);
        assert.equal(gv.variantId, v.variantId);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Adapter table
// ---------------------------------------------------------------------------

const stressTest = new StressTestCatalogAdapter();
contractSuite("stress-test", () => ({ adapter: stressTest, commerce: stressTest }));

let shopify: AdapterPair | null = null;
contractSuite(
  "shopify",
  () => {
    if (!shopify) {
      const adapter = new ShopifyAdapter({
        endpoint: process.env.SHOPIFY_ENDPOINT ?? "",
        storefrontAccessToken: process.env.SHOPIFY_STOREFRONT_TOKEN ?? "",
      });
      shopify = { adapter, commerce: adapter };
    }
    return shopify;
  },
  { skip: process.env.SHOPIFY_E2E !== "1" },
);

// ---------------------------------------------------------------------------
// Stress-test adapter specifics (lexical search + constraint filtering)
// ---------------------------------------------------------------------------

test("stress-test: lexical search ranks exact title matches above partial", async () => {
  const products = await stressTest.listProducts();
  const target = products[0];
  const results = await stressTest.search(target.title);
  assert.ok(results.length > 0);
  // The exact-title product should be the top result (score 1.0).
  assert.equal(results[0].product.productId, target.productId);
  assert.equal(results[0].score, 1);
});

test("stress-test: price_max constraint filters results", async () => {
  const products = await stressTest.listProducts();
  const cheapest = [...products].sort((a, b) => a.price - b.price)[0];
  const results = await stressTest.search(cheapest.title, [
    { kind: "price_max", value: cheapest.price, hardness: "hard", sourceText: "x" },
  ]);
  for (const r of results) {
    assert.ok(
      r.product.price <= cheapest.price,
      `result ${r.product.productId} respects price_max`,
    );
  }
});

test("stress-test: category constraint filters results", async () => {
  const products = await stressTest.listProducts();
  const target = products[0];
  const category = target.categoryPath[0];
  const results = await stressTest.search(target.title, [
    { kind: "category", value: category, hardness: "hard", sourceText: "x" },
  ]);
  assert.ok(results.length > 0);
  for (const r of results) {
    assert.ok(
      r.product.categoryPath.includes(category),
      `result ${r.product.productId} is in category ${category}`,
    );
  }
});
