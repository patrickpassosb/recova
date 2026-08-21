import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  CatalogProductSchema,
  parseCatalogProduct,
  parseCatalogProductSafe,
  isAdversarial,
  adversarialKind,
  CATALOG_SEED,
  generateCatalog,
  selectRows,
  selectDevFixture,
  mulberry32,
  topLevelCategory,
  APPAREL_CATEGORY,
  type CatalogProduct,
  type SourceRow,
} from "./schema.js";

/**
 * Catalog schema + deterministic importer tests (W06).
 *
 * Covers: dev-fixture parse, adversarial-marker recognition, and pure
 * selection determinism on a tiny in-memory input. No network access here —
 * the importer's pure pipeline (`generateCatalog` / `selectRows`) is exercised
 * directly against in-memory `SourceRow`s.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const fixturePath = resolve(repoRoot, "catalog/fixtures/catalog.dev.jsonl");

function readFixture(): CatalogProduct[] {
  const text = readFileSync(fixturePath, "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as CatalogProduct);
}

function row(
  split: "train" | "test",
  rowIndex: number,
  title: string,
  categoryPath: string[],
  brand = "Brand",
): SourceRow {
  return {
    split,
    rowIndex,
    title,
    description: `description for ${title}`,
    brand,
    categoryPath,
    imageUrl: null,
  };
}

function product(
  productId: string,
  categoryPath: string[],
  adversarial = false,
): CatalogProduct {
  return {
    productId,
    title: productId,
    description: "",
    brand: "Brand",
    categoryPath,
    price: 10,
    currency: "USD",
    imageUrls: [],
    variants: [
      {
        variantId: `${productId}_v0`,
        sku: `SKU-${productId}`,
        options: [],
        price: 10,
        available: true,
      },
    ],
    _provenance: {
      source: productId,
      sourceSplit: "train",
      sourceRowIndex: 0,
      generated: {
        price: true,
        availability: true,
        variants: false,
        sku: true,
        title: false,
      },
      adversarial,
      adversarialKind: adversarial ? "near-title" : null,
      seed: CATALOG_SEED,
    },
  };
}

test("dev fixture parses and every product validates", () => {
  const products = readFixture();
  assert.ok(products.length > 0, "dev fixture is non-empty");
  assert.equal(products.length, 500, "dev fixture has ~500 products");
  for (const p of products) {
    const result = parseCatalogProductSafe(p);
    assert.equal(result.success, true, `product ${(p as { productId?: string }).productId} is valid`);
  }
});

test("dev fixture products carry at least one variant and a provenance object", () => {
  const products = readFixture();
  for (const p of products) {
    assert.ok(p.variants.length >= 1, `${p.productId} has >= 1 variant`);
    assert.equal(typeof p._provenance.seed, "number");
    assert.equal(p._provenance.seed, CATALOG_SEED);
  }
});

test("adversarial marker is recognized via isAdversarial", () => {
  const base = readFixture()[0];
  const adversarial: CatalogProduct = {
    ...base,
    _provenance: {
      ...base._provenance,
      adversarial: true,
      adversarialKind: "cross-category-echo",
    },
  };
  const normal: CatalogProduct = {
    ...base,
    _provenance: { ...base._provenance, adversarial: false, adversarialKind: null },
  };

  assert.equal(isAdversarial(adversarial), true);
  assert.equal(adversarialKind(adversarial), "cross-category-echo");
  assert.equal(isAdversarial(normal), false);
  assert.equal(adversarialKind(normal), null);
});

test("dev fixture adversarial products are recognized consistently", () => {
  const products = readFixture();
  const adversarial = products.filter((p) => isAdversarial(p));
  // The deterministic importer marks ~150 of 10,000 products adversarial; the
  // first 500 (the dev fixture) must contain at least one so the fixture
  // exercises adversarial recognition.
  assert.ok(adversarial.length >= 1, "dev fixture contains adversarial products");
  for (const p of adversarial) {
    assert.ok(
      p._provenance.adversarialKind === "near-title" ||
        p._provenance.adversarialKind === "cross-category-echo",
      `${p.productId} has a known adversarial kind`,
    );
    assert.equal(p._provenance.generated.title, true);
  }
});

test("selectRows keeps all apparel and fills remaining slots", () => {
  const rows = [
    row("train", 0, "Dress A", ["Apparel & Accessories", "Dresses"]),
    row("train", 1, "Dress B", ["Apparel & Accessories", "Dresses"]),
    row("train", 2, "Shirt", ["Apparel & Accessories", "Shirts"]),
    row("train", 3, "Lamp", ["Home & Garden", "Lighting"]),
    row("train", 4, "Chair", ["Home & Garden", "Furniture"]),
    row("train", 5, "Phone", ["Electronics", "Phones"]),
    row("train", 6, "Ball", ["Sports & Outdoors", "Balls"]),
  ];
  const rng = mulberry32(CATALOG_SEED);
  const selected = selectRows(rows, 7, rng);
  assert.equal(selected.length, 7);
  const apparel = selected.filter(
    (r) => topLevelCategory(r.categoryPath) === APPAREL_CATEGORY,
  );
  assert.equal(apparel.length, 3, "all apparel rows are kept");
});

test("selectDevFixture produces category diversity and retains adversarial products", () => {
  const products = [
    product("p_apparel_1", ["Apparel & Accessories", "Dresses"]),
    product("p_apparel_2", ["Apparel & Accessories", "Dresses"]),
    product("p_apparel_3", ["Apparel & Accessories", "Shirts"]),
    product("p_home_1", ["Home & Garden", "Lighting"]),
    product("p_home_2", ["Home & Garden", "Furniture"]),
    product("p_elec_1", ["Electronics", "Phones"]),
    product("p_elec_2", ["Electronics", "Laptops"]),
    product("p_sport_1", ["Sports & Outdoors", "Balls"]),
    product("p_sport_2", ["Sports & Outdoors", "Bikes"], true),
  ];
  const rng = mulberry32(CATALOG_SEED);
  const fixture = selectDevFixture(products, 9, rng);
  assert.equal(fixture.length, 9);
  const cats = new Set(fixture.map((p) => topLevelCategory(p.categoryPath)));
  assert.ok(cats.size > 1, "dev fixture spans multiple top-level categories");
  assert.ok(
    fixture.some((p) => isAdversarial(p)),
    "dev fixture retains adversarial products",
  );
});

test("generateCatalog is deterministic on tiny in-memory input", () => {
  const rows = [
    row("train", 0, "Dress A", ["Apparel & Accessories", "Dresses"]),
    row("train", 1, "Dress B", ["Apparel & Accessories", "Dresses"]),
    row("train", 2, "Shirt", ["Apparel & Accessories", "Shirts"]),
    row("train", 3, "Lamp", ["Home & Garden", "Lighting"]),
    row("train", 4, "Chair", ["Home & Garden", "Furniture"]),
    row("train", 5, "Phone", ["Electronics", "Phones"]),
    row("train", 6, "Ball", ["Sports & Outdoors", "Balls"]),
    row("test", 0, "Shoes", ["Apparel & Accessories", "Shoes"]),
    row("test", 1, "Mug", ["Home & Garden", "Kitchen"]),
  ];
  const a = generateCatalog(rows, 9, CATALOG_SEED);
  const b = generateCatalog(rows, 9, CATALOG_SEED);
  assert.deepEqual(a, b, "two runs with the same seed are byte-identical");
  assert.equal(a.length, 9);
});

test("generated products validate against the schema", () => {
  const rows = [
    row("train", 0, "Dress", ["Apparel & Accessories", "Dresses"]),
    row("train", 1, "Lamp", ["Home & Garden", "Lighting"]),
  ];
  const products = generateCatalog(rows, 2, CATALOG_SEED);
  for (const p of products) {
    assert.equal(CatalogProductSchema.safeParse(p).success, true);
    assert.equal(parseCatalogProduct(p).productId, p.productId);
  }
});
