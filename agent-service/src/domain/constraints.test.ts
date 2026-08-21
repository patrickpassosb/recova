import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractConstraints,
  normalize,
  normalizeSynonym,
  stripAccents,
  stripPlural,
  COLOR_SYNONYMS,
  CATEGORY_SYNONYMS,
  USE_SYNONYMS,
  DEFAULT_HARDNESS,
} from "./constraints.js";
import type { ConstraintKind, ShopperConstraint } from "./schemas.js";

/**
 * Constraint extraction tests. Cover the `extract.*` acceptance-matrix rows
 * with positive and negative cases, plus the normalization module.
 */

function find(
  constraints: ShopperConstraint[],
  kind: ConstraintKind,
): ShopperConstraint | undefined {
  return constraints.find((c) => c.kind === kind);
}

function assertConstraint(
  constraints: ShopperConstraint[],
  kind: ConstraintKind,
  value: string | number,
  hardness: "hard" | "soft",
): void {
  const c = find(constraints, kind);
  assert.ok(c, `expected a ${kind} constraint, got: ${JSON.stringify(constraints)}`);
  assert.equal(c.value, value);
  assert.equal(c.hardness, hardness);
  assert.ok(c.sourceText.length > 0, "sourceText must be preserved");
}

// ---------------------------------------------------------------------------
// Normalization module
// ---------------------------------------------------------------------------

test("normalize lowercases and strips accents", () => {
  assert.equal(normalize("  Café  DÉCOR "), "cafe decor");
});

test("stripAccents removes combining diacritics", () => {
  assert.equal(stripAccents("café résumé"), "cafe resume");
});

test("stripPlural handles basic English plurals", () => {
  assert.equal(stripPlural("dresses"), "dress");
  assert.equal(stripPlural("parties"), "party");
  assert.equal(stripPlural("shoes"), "shoe");
  assert.equal(stripPlural("dress"), "dress"); // "ss" not stripped
});

test("normalizeSynonym maps through a table with plural fallback", () => {
  assert.equal(normalizeSynonym("sneakers", CATEGORY_SYNONYMS), "shoes");
  assert.equal(normalizeSynonym("grey", COLOR_SYNONYMS), "gray");
  assert.equal(normalizeSynonym("gown", CATEGORY_SYNONYMS), "dress");
});

// ---------------------------------------------------------------------------
// extract.synonyms
// ---------------------------------------------------------------------------

test("extract.synonyms: category synonyms normalize to canonical terms", () => {
  assertConstraint(extractConstraints("I need a dress"), "category", "dress", "hard");
  assertConstraint(extractConstraints("sneakers"), "category", "shoes", "hard");
  assertConstraint(extractConstraints("a couch for the living room"), "category", "sofa", "hard");
  assertConstraint(extractConstraints("a gown"), "category", "dress", "hard");
});

test("extract.synonyms: color synonyms normalize (grey → gray)", () => {
  assertConstraint(extractConstraints("a grey dress"), "color", "gray", "soft");
});

test("extract.synonyms: negative — no category for a bare query", () => {
  assert.equal(find(extractConstraints("hello there"), "category"), undefined);
});

// ---------------------------------------------------------------------------
// extract.price
// ---------------------------------------------------------------------------

test("extract.price: 'under $120' parses as price_max", () => {
  assertConstraint(extractConstraints("a dress under $120"), "price_max", 120, "hard");
});

test("extract.price: 'up to 300' parses as price_max", () => {
  assertConstraint(extractConstraints("shoes up to 300"), "price_max", 300, "hard");
});

test("extract.price: 'up to R$300' parses as price_max", () => {
  assertConstraint(extractConstraints("shoes up to R$300"), "price_max", 300, "hard");
});

test("extract.price: 'less than $50' parses as price_max", () => {
  assertConstraint(extractConstraints("less than $50"), "price_max", 50, "hard");
});

test("extract.price: numeric range takes the upper bound", () => {
  assertConstraint(extractConstraints("between $50 and $100"), "price_max", 100, "hard");
});

test("extract.price: negative — no price in a plain query", () => {
  assert.equal(find(extractConstraints("a red dress"), "price_max"), undefined);
});

test("extract.price: terminates and deduplicates repeated price phrases", () => {
  const constraints = extractConstraints("under $120 and under $120");
  const prices = constraints.filter((c) => c.kind === "price_max");
  assert.equal(prices.length, 1);
  assert.equal(prices[0].value, 120);
});

// ---------------------------------------------------------------------------
// extract.size
// ---------------------------------------------------------------------------

test("extract.size: numeric size parses", () => {
  assertConstraint(extractConstraints("size 8 shoes"), "size", "8", "hard");
});

test("extract.size: letter size parses and uppercases", () => {
  assertConstraint(extractConstraints("a dress size M"), "size", "M", "hard");
});

test("extract.size: US/EU numerics parse", () => {
  assertConstraint(extractConstraints("US 8 shoes"), "size", "8", "hard");
  assertConstraint(extractConstraints("EU 38 shoes"), "size", "38", "hard");
});

test("extract.size: 'one size' parses", () => {
  assertConstraint(extractConstraints("one size hat"), "size", "one size", "hard");
});

test("extract.size: standalone uppercase letter parses", () => {
  assertConstraint(extractConstraints("a red dress M"), "size", "M", "hard");
});

test("extract.size: negative — no size in a plain query", () => {
  assert.equal(find(extractConstraints("a red dress"), "size"), undefined);
});

// ---------------------------------------------------------------------------
// extract.color
// ---------------------------------------------------------------------------

test("extract.color: named color parses as soft", () => {
  assertConstraint(extractConstraints("a red dress"), "color", "red", "soft");
});

test("extract.color: multi-word color normalizes (navy blue → navy)", () => {
  assertConstraint(extractConstraints("a navy blue dress"), "color", "navy", "soft");
});

test("extract.color: negative — no color in a plain query", () => {
  assert.equal(find(extractConstraints("a dress"), "color"), undefined);
});

test("extract.color: unsupported color is not extracted when catalog facets are provided", () => {
  const supported = new Set(["red", "blue", "black"]);
  const constraints = extractConstraints("an orange dress", {
    supportedColors: supported,
  });
  assert.equal(find(constraints, "color"), undefined);
});

test("extract.color: supported color is extracted when catalog facets are provided", () => {
  const supported = new Set(["red", "blue", "black"]);
  assertConstraint(
    extractConstraints("a red dress", { supportedColors: supported }),
    "color",
    "red",
    "soft",
  );
});

test("extract.color: color word in a named title is not extracted", () => {
  const constraints = extractConstraints("Orange Crush 20 amplifier");
  assert.equal(find(constraints, "color"), undefined);
});

test("extract.color: lowercase color word is still extracted", () => {
  assertConstraint(extractConstraints("an orange dress"), "color", "orange", "soft");
});

// ---------------------------------------------------------------------------
// extract.compatibility
// ---------------------------------------------------------------------------

test("extract.compatibility: 'compatible with X' parses", () => {
  assertConstraint(
    extractConstraints("a case compatible with iPhone 15"),
    "compatibility",
    "iphone 15",
    "hard",
  );
});

test("extract.compatibility: 'for iPhone' parses", () => {
  assertConstraint(extractConstraints("a charger for iPhone"), "compatibility", "iphone", "hard");
});

test("extract.compatibility: negative — 'for running' is not compatibility", () => {
  assert.equal(find(extractConstraints("shoes for running"), "compatibility"), undefined);
});

// ---------------------------------------------------------------------------
// extract.intended-use
// ---------------------------------------------------------------------------

test("extract.intended-use: 'for running' parses as soft", () => {
  assertConstraint(extractConstraints("shoes for running"), "intended_use", "running", "soft");
});

test("extract.intended-use: 'for a wedding' parses", () => {
  assertConstraint(extractConstraints("a dress for a wedding"), "intended_use", "wedding", "soft");
});

test("extract.intended-use: 'for the gym' parses", () => {
  assertConstraint(extractConstraints("clothes for the gym"), "intended_use", "gym", "soft");
});

test("extract.intended-use: negative — 'for iPhone' is not intended use", () => {
  assert.equal(find(extractConstraints("a case for iPhone"), "intended_use"), undefined);
});

// ---------------------------------------------------------------------------
// Hardness defaults and must/only upgrade
// ---------------------------------------------------------------------------

test("hardness: price_max/size/compatibility are hard by default", () => {
  assert.equal(DEFAULT_HARDNESS.price_max, "hard");
  assert.equal(DEFAULT_HARDNESS.size, "hard");
  assert.equal(DEFAULT_HARDNESS.compatibility, "hard");
});

test("hardness: color/intended_use are soft by default", () => {
  assert.equal(DEFAULT_HARDNESS.color, "soft");
  assert.equal(DEFAULT_HARDNESS.intended_use, "soft");
});

test("hardness: 'only' upgrades a soft color to hard", () => {
  assertConstraint(extractConstraints("I only want a red dress"), "color", "red", "hard");
});

test("hardness: 'must' upgrades a soft intended use to hard", () => {
  assertConstraint(extractConstraints("must be for running"), "intended_use", "running", "hard");
});

test("hardness: soft color stays soft without must/only", () => {
  assertConstraint(extractConstraints("a red dress"), "color", "red", "soft");
});

// ---------------------------------------------------------------------------
// Multi-constraint extraction
// ---------------------------------------------------------------------------

test("extracts multiple constraints from one query", () => {
  const constraints = extractConstraints("a red dress size M under $120");
  assertConstraint(constraints, "category", "dress", "hard");
  assertConstraint(constraints, "color", "red", "soft");
  assertConstraint(constraints, "size", "M", "hard");
  assertConstraint(constraints, "price_max", 120, "hard");
});

test("compatibility target is not double-extracted as a category", () => {
  const constraints = extractConstraints("a case for iPhone 15");
  assertConstraint(constraints, "compatibility", "iphone 15", "hard");
  assert.equal(find(constraints, "category"), undefined);
});
