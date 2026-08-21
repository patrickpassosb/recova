import assert from "node:assert/strict";
import { test } from "node:test";
import {
  route,
  evaluateCandidate,
  validateCandidates,
  isAmbiguousIntent,
  assertIdsInUniverse,
  DomainInvariantError,
  type IdUniverse,
} from "./solver.js";
import { buildDecisionCards, type CatalogCandidate } from "./cards.js";
import { extractConstraints } from "./constraints.js";
import { MerchantConfigSchema } from "./schemas.js";
import type {
  ConstraintKind,
  RecoveryDecision,
  ShopperConstraint,
} from "./schemas.js";

/**
 * Solver + Decision Card tests. Cover every `docs/ACCEPTANCE_MATRIX.md` row
 * against a small hand-built catalog (~25 products) that includes adversarial
 * near-matches, out-of-stock variants, and cross-category distractors.
 *
 * The catalog mirrors the `docs/RECOVERY_BENCHMARK.md` fixture shape so the
 * benchmark runner can call `extractConstraints` and `route` directly.
 */

function mk(
  productId: string,
  title: string,
  category: string,
  size: string | undefined,
  color: string | undefined,
  price: number,
  available: boolean,
  intendedUse?: string,
  compatibility?: string,
): CatalogCandidate {
  return {
    productId,
    variantId: `v_${productId}`,
    handle: productId,
    title,
    imageUrl: null,
    price,
    available,
    selectedOptions: [],
    attributes: { category, size, color, intendedUse, compatibility },
  };
}

function catalog(): CatalogCandidate[] {
  return [
    // dresses (the primary recovery target)
    mk("p_dress_red_m", "Red Midi Dress", "dress", "M", "red", 89, true),
    mk("p_dress_red_m_cheap", "Red Cotton Dress", "dress", "M", "red", 45, true),
    mk("p_dress_blue_s", "Blue Midi Dress", "dress", "S", "blue", 79, true),
    mk("p_dress_black_l", "Black Maxi Dress", "dress", "L", "black", 120, true),
    mk("p_dress_red_xl", "Red Maxi Dress", "dress", "XL", "red", 95, true),
    // adversarial: out-of-stock near-match
    mk("p_dress_red_m_oos", "Red Midi Dress", "dress", "M", "red", 89, false),
    // adversarial: over-budget near-match
    mk("p_dress_red_m_expensive", "Red Silk Dress", "dress", "M", "red", 250, true),
    // adversarial: missing color / missing size evidence
    mk("p_dress_red_m_nocolor", "Midi Dress", "dress", "M", undefined, 89, true),
    mk("p_dress_red_nosize", "Red Dress", "dress", undefined, "red", 89, true),
    // intended-use variants
    mk("p_dress_red_m_wedding", "Red Wedding Dress", "dress", "M", "red", 300, true, "wedding"),
    mk("p_dress_white_m_wedding", "White Wedding Dress", "dress", "M", "white", 350, true, "wedding"),
    // shirts
    mk("p_shirt_blue_m", "Blue Oxford Shirt", "shirt", "M", "blue", 45, true),
    mk("p_shirt_white_l", "White Dress Shirt", "shirt", "L", "white", 55, true),
    // shoes (intended-use competition)
    mk("p_shoes_running_9", "Running Shoes", "shoes", "9", "black", 110, true, "running"),
    mk("p_shoes_running_10", "Running Shoes", "shoes", "10", "black", 115, true, "running"),
    mk("p_shoes_casual_9", "Casual Sneakers", "shoes", "9", "white", 70, true, "casual"),
    mk("p_shoes_hiking_8", "Hiking Boots", "shoes", "8", "brown", 130, true, "hiking"),
    // cross-category distractors (satisfy soft color, violate hard category)
    mk("p_hat_red", "Red Baseball Cap", "hat", undefined, "red", 25, true),
    mk("p_bag_red", "Red Handbag", "bag", undefined, "red", 150, true),
    // electronics (compatibility)
    mk("p_phone_case_iphone15", "iPhone 15 Case", "case", undefined, undefined, 25, true, undefined, "iphone 15"),
    mk("p_phone_case_android", "Android Case", "case", undefined, undefined, 20, true, undefined, "android"),
    mk("p_phone_charger", "Phone Charger", "charger", undefined, undefined, 15, true, undefined, "iphone"),
    mk("p_laptop_13", "13-inch Laptop", "laptop", undefined, undefined, 900, true),
    // home and garden
    mk("p_sofa_gray", "Gray Sofa", "sofa", undefined, "gray", 800, true),
    mk("p_sofa_beige", "Beige Sofa", "sofa", undefined, "beige", 750, true),
  ];
}

function c(
  kind: ConstraintKind,
  value: string | number,
  hardness: "hard" | "soft",
): ShopperConstraint {
  return { kind, value, hardness, sourceText: `${kind} ${value}` };
}

function universe(candidates: CatalogCandidate[]): IdUniverse {
  const productIds = new Set<string>();
  const variantIds = new Set<string>();
  const variantToProduct = new Map<string, string>();
  for (const p of candidates) {
    productIds.add(p.productId);
    variantIds.add(p.variantId);
    variantToProduct.set(p.variantId, p.productId);
  }
  return { productIds, variantIds, variantToProduct };
}

// ---------------------------------------------------------------------------
// route.native-ok
// ---------------------------------------------------------------------------

test("route.native-ok: strong native query stays hidden", () => {
  const constraints = [
    c("category", "dress", "hard"),
    c("size", "M", "hard"),
    c("color", "red", "soft"),
  ];
  const decision = route(["p_dress_red_m"], catalog(), constraints);
  assert.equal(decision.route, "NATIVE_OK");
  assert.equal(decision.cards.length, 0);
  assert.equal(decision.strategy, null);
});

test("route: native result with unknown hard evidence is not NATIVE_OK", () => {
  const constraints = [c("category", "dress", "hard"), c("size", "M", "hard")];
  const decision = route(["p_dress_red_nosize"], catalog(), constraints);
  assert.notEqual(decision.route, "NATIVE_OK");
});

// ---------------------------------------------------------------------------
// route.zero-results
// ---------------------------------------------------------------------------

test("route.zero-results: zero native results activates recovery", () => {
  const constraints = [c("category", "dress", "hard"), c("price_max", 100, "hard")];
  const decision = route([], catalog(), constraints);
  assert.equal(decision.route, "RECOVER");
  assert.equal(decision.strategy, "QUERY_REPAIR");
  assert.ok(decision.cards.length > 0);
});

// ---------------------------------------------------------------------------
// route.constraint-violating-native
// ---------------------------------------------------------------------------

test("route.constraint-violating-native: offending native result is rejected", () => {
  const constraints = [c("category", "dress", "hard")];
  const decision = route(["p_hat_red"], catalog(), constraints);
  assert.equal(decision.route, "RECOVER");
  const rejected = decision.rejectedCandidates.find(
    (r) => r.productId === "p_hat_red",
  );
  assert.ok(rejected);
  assert.equal(rejected.classification, "HARD_CONSTRAINT_VIOLATION");
});

// ---------------------------------------------------------------------------
// route.ambiguous-intent
// ---------------------------------------------------------------------------

test("route.ambiguous-intent: empty constraints trigger clarification", () => {
  const decision = route([], catalog(), []);
  assert.equal(decision.route, "CLARIFY");
  assert.ok(decision.refinementPrompt);
  assert.equal(decision.cards.length, 0);
});

test("route.ambiguous-intent: conflicting hard categories trigger clarification", () => {
  const constraints = [
    c("category", "dress", "hard"),
    c("category", "shoes", "hard"),
  ];
  const decision = route([], catalog(), constraints);
  assert.equal(decision.route, "CLARIFY");
  assert.ok(decision.refinementPrompt);
});

test("isAmbiguousIntent: empty and conflicting constraints are ambiguous", () => {
  assert.equal(isAmbiguousIntent([]), true);
  assert.equal(
    isAmbiguousIntent([c("category", "dress", "hard"), c("category", "shoes", "hard")]),
    true,
  );
  assert.equal(isAmbiguousIntent([c("category", "dress", "hard")]), false);
});

// ---------------------------------------------------------------------------
// route.no-valid-candidate
// ---------------------------------------------------------------------------

test("route.no-valid-candidate: no valid candidate clarifies without padding", () => {
  const constraints = [c("category", "dress", "hard"), c("price_max", 10, "hard")];
  const decision = route([], catalog(), constraints);
  assert.equal(decision.route, "CLARIFY");
  assert.equal(decision.cards.length, 0);
});

// ---------------------------------------------------------------------------
// hard-constraint.enforcement / no-relaxation
// ---------------------------------------------------------------------------

test("hard-constraint.enforcement: every card satisfies all hard constraints", () => {
  const constraints = [
    c("category", "dress", "hard"),
    c("size", "M", "hard"),
    c("color", "red", "soft"),
  ];
  const decision = route([], catalog(), constraints);
  assert.equal(decision.route, "RECOVER");
  for (const card of decision.cards) {
    for (const con of constraints) {
      if (con.hardness === "hard") {
        assert.ok(
          card.satisfied.includes(con.kind),
          `card ${card.productId} must satisfy ${con.kind}`,
        );
        assert.ok(!card.relaxedSoft.includes(con.kind));
      }
    }
  }
});

test("hard-constraint.no-relaxation: no hard kind appears in relaxedSoft", () => {
  const constraints = [c("category", "dress", "hard"), c("color", "purple", "soft")];
  const decision = route([], catalog(), constraints);
  for (const card of decision.cards) {
    for (const con of constraints) {
      if (con.hardness === "hard") {
        assert.ok(!card.relaxedSoft.includes(con.kind));
      }
    }
  }
});

test("hard-constraint.enforcement: a soft constraint cannot bypass a hard constraint of the same kind", () => {
  const constraints = [
    c("category", "dress", "hard"),
    c("category", "shirt", "soft"),
  ];
  const shirt = catalog().find((p) => p.productId === "p_shirt_blue_m")!;
  const ev = evaluateCandidate(shirt, constraints);
  assert.equal(ev.valid, false);
  assert.equal(ev.rejection!.classification, "HARD_CONSTRAINT_VIOLATION");
  assert.ok(!ev.satisfied.includes("category"));
});

// ---------------------------------------------------------------------------
// soft-relaxation.explicit
// ---------------------------------------------------------------------------

test("soft-relaxation.explicit: relaxed soft preference is disclosed", () => {
  const constraints = [c("category", "dress", "hard"), c("color", "purple", "soft")];
  const decision = route([], catalog(), constraints);
  assert.equal(decision.route, "RECOVER");
  const relaxed = decision.cards.filter((card) => card.relaxedSoft.includes("color"));
  assert.ok(relaxed.length > 0);
  for (const card of relaxed) {
    assert.ok(card.reason.includes("color"), "reason must disclose relaxed color");
  }
});

// ---------------------------------------------------------------------------
// cards.max-3 / no-bestseller-padding
// ---------------------------------------------------------------------------

test("cards.max-3: at most three cards are rendered", () => {
  const constraints = [c("category", "dress", "hard")];
  const decision = route([], catalog(), constraints);
  assert.equal(decision.route, "RECOVER");
  assert.ok(decision.cards.length <= 3);
  assert.equal(decision.cards.length, 3);
});

test("cards.no-bestseller-padding: does not pad to reach a count", () => {
  const constraints = [
    c("category", "dress", "hard"),
    c("size", "M", "hard"),
    c("color", "red", "soft"),
    c("price_max", 50, "hard"),
  ];
  const decision = route([], catalog(), constraints);
  assert.equal(decision.cards.length, 1);
  assert.equal(decision.cards[0].productId, "p_dress_red_m_cheap");
});

test("cards.no-bestseller-padding: every card is grounded in the adapter universe", () => {
  const constraints = [c("category", "dress", "hard")];
  const decision = route([], catalog(), constraints);
  const ids = universe(catalog());
  for (const card of decision.cards) {
    assert.ok(ids.productIds.has(card.productId));
  }
});

// ---------------------------------------------------------------------------
// cards.unknown-stays-unknown
// ---------------------------------------------------------------------------

test("cards.unknown-stays-unknown: unknown evidence surfaces in unknown", () => {
  const constraints = [c("category", "dress", "hard"), c("color", "red", "soft")];
  const nocolor = catalog().find((p) => p.productId === "p_dress_red_m_nocolor")!;
  const ev = evaluateCandidate(nocolor, constraints);
  assert.equal(ev.valid, true);
  assert.ok(ev.unknown.includes("color"));
  assert.ok(!ev.satisfied.includes("color"));
  assert.ok(!ev.relaxedSoft.includes("color"));

  const cards = buildDecisionCards([ev], constraints);
  assert.equal(cards.length, 1);
  assert.ok(cards[0].unknown.includes("color"));
  assert.ok(!cards[0].satisfied.includes("color"));
  assert.ok(!cards[0].relaxedSoft.includes("color"));
});

test("insufficient evidence: hard constraint with unknown evidence is rejected", () => {
  const constraints = [c("category", "dress", "hard"), c("size", "M", "hard")];
  const nosize = catalog().find((p) => p.productId === "p_dress_red_nosize")!;
  const ev = evaluateCandidate(nosize, constraints);
  assert.equal(ev.valid, false);
  assert.equal(ev.rejection!.classification, "INSUFFICIENT_EVIDENCE");
});

// ---------------------------------------------------------------------------
// ids.no-llm-invention
// ---------------------------------------------------------------------------

test("ids.no-llm-invention: every emitted ID is in the adapter universe", () => {
  const constraints = [c("category", "dress", "hard")];
  const decision = route([], catalog(), constraints);
  const ids = universe(catalog());
  for (const card of decision.cards) {
    assert.ok(ids.productIds.has(card.productId));
    assert.ok(ids.variantIds.has(card.variantId));
  }
  for (const r of decision.rejectedCandidates) {
    assert.ok(ids.productIds.has(r.productId));
    if (r.variantId) assert.ok(ids.variantIds.has(r.variantId));
  }
});

test("ids.no-llm-invention: assertIdsInUniverse throws DomainInvariantError", () => {
  const ids: IdUniverse = {
    productIds: new Set(["p_1"]),
    variantIds: new Set(["v_1"]),
    variantToProduct: new Map([["v_1", "p_1"]]),
  };
  const decision: RecoveryDecision = {
    sessionId: "s",
    route: "RECOVER",
    strategy: "EXACT_ALTERNATIVE",
    activationReasons: [],
    constraints: [],
    cards: [
      {
        productId: "p_evil",
        variantId: "v_evil",
        handle: "x",
        title: "x",
        imageUrl: null,
        price: 1,
        available: true,
        selectedOptions: [],
        matchScore: 1,
        satisfied: [],
        relaxedSoft: [],
        unknown: [],
        reason: "x",
        rank: 1,
      },
    ],
    rejectedCandidates: [],
    refinementPrompt: null,
    refinementOptions: [],
  };
  assert.throws(() => assertIdsInUniverse(decision, ids), DomainInvariantError);
});

test("ids.no-llm-invention: swapped product/variant roles are rejected", () => {
  const ids: IdUniverse = {
    productIds: new Set(["p-real"]),
    variantIds: new Set(["v-real"]),
    variantToProduct: new Map([["v-real", "p-real"]]),
  };
  const decision: RecoveryDecision = {
    sessionId: "s",
    route: "RECOVER",
    strategy: "EXACT_ALTERNATIVE",
    activationReasons: [],
    constraints: [],
    cards: [
      {
        productId: "v-real",
        variantId: "p-real",
        handle: "x",
        title: "x",
        imageUrl: null,
        price: 1,
        available: true,
        selectedOptions: [],
        matchScore: 1,
        satisfied: [],
        relaxedSoft: [],
        unknown: [],
        reason: "x",
        rank: 1,
      },
    ],
    rejectedCandidates: [],
    refinementPrompt: null,
    refinementOptions: [],
  };
  assert.throws(() => assertIdsInUniverse(decision, ids), DomainInvariantError);
});

// ---------------------------------------------------------------------------
// Rejection classifications
// ---------------------------------------------------------------------------

test("rejection: unavailable candidate is classified UNAVAILABLE", () => {
  const constraints = [c("category", "dress", "hard")];
  const decision = route([], catalog(), constraints);
  const oos = decision.rejectedCandidates.find(
    (r) => r.productId === "p_dress_red_m_oos",
  );
  assert.ok(oos);
  assert.equal(oos.classification, "UNAVAILABLE");
});

test("rejection: near-match satisfying soft but violating hard is rejected", () => {
  const constraints = [c("category", "dress", "hard"), c("color", "red", "soft")];
  const decision = route([], catalog(), constraints);
  const hat = decision.rejectedCandidates.find((r) => r.productId === "p_hat_red");
  assert.ok(hat);
  assert.equal(hat.classification, "HARD_CONSTRAINT_VIOLATION");
  assert.ok(!decision.cards.some((card) => card.productId === "p_hat_red"));
});

test("cross-category distractor never appears in cards", () => {
  const constraints = [c("category", "dress", "hard")];
  const decision = route([], catalog(), constraints);
  for (const card of decision.cards) {
    assert.ok(!card.productId.startsWith("p_hat"));
    assert.ok(!card.productId.startsWith("p_bag"));
  }
});

// ---------------------------------------------------------------------------
// Strategy selection
// ---------------------------------------------------------------------------

test("strategy: soft preference relaxation when soft constraints are relaxed", () => {
  const constraints = [c("category", "dress", "hard"), c("color", "purple", "soft")];
  const decision = route(["p_hat_red"], catalog(), constraints);
  assert.equal(decision.route, "RECOVER");
  assert.equal(decision.strategy, "SOFT_PREFERENCE_RELAXATION");
});

test("strategy: exact alternative when native violates and no soft relaxation", () => {
  const constraints = [c("category", "dress", "hard")];
  const decision = route(["p_hat_red"], catalog(), constraints);
  assert.equal(decision.route, "RECOVER");
  assert.equal(decision.strategy, "EXACT_ALTERNATIVE");
});

// ---------------------------------------------------------------------------
// Ranking determinism
// ---------------------------------------------------------------------------

test("ranking: deterministic tiebreak by price then id", () => {
  const constraints = [c("category", "dress", "hard"), c("color", "red", "soft")];
  const decision = route([], catalog(), constraints);
  assert.equal(decision.cards[0].productId, "p_dress_red_m_cheap");
  assert.equal(decision.cards[0].rank, 1);
});

// ---------------------------------------------------------------------------
// validateCandidates
// ---------------------------------------------------------------------------

test("validateCandidates partitions valid and rejected candidates", () => {
  const constraints = [c("category", "dress", "hard")];
  const { valid, rejected } = validateCandidates(catalog(), constraints);
  assert.ok(valid.length > 0);
  assert.ok(valid.every((e) => e.valid));
  assert.ok(rejected.length > 0);
  assert.ok(rejected.every((r) => r.classification !== undefined));
});

// ---------------------------------------------------------------------------
// merchant.fail-safe
// ---------------------------------------------------------------------------

test("merchant.fail-safe: invalid MerchantConfig is rejected", () => {
  const result = MerchantConfigSchema.safeParse({ storeId: "s" });
  assert.equal(result.success, false);
});

test("merchant.fail-safe: valid MerchantConfig parses", () => {
  const result = MerchantConfigSchema.safeParse({
    storeId: "store-1",
    catalogAdapter: "stress-test",
    commerceAdapter: "shopify",
    branding: {},
    enabledStrategies: ["EXACT_ALTERNATIVE"],
    repairPermissions: {},
    modelLimits: {},
    attribution: {},
    featureFlags: {},
  });
  assert.equal(result.success, true);
});

// ---------------------------------------------------------------------------
// Benchmark-style end-to-end (extract → route)
// ---------------------------------------------------------------------------

test("benchmark-style: extract then route end-to-end", () => {
  const query = "a red dress size M under $120";
  const constraints = extractConstraints(query);
  const decision = route([], catalog(), constraints);
  assert.equal(decision.route, "RECOVER");
  for (const card of decision.cards) {
    for (const con of constraints) {
      if (con.hardness === "hard") {
        assert.ok(card.satisfied.includes(con.kind));
      }
    }
  }
});
