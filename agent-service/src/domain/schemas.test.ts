import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RecoveryDecisionSchema,
  type RecoveryDecision,
} from "./schemas.js";

/**
 * Domain contract tests for the recovery schemas.
 *
 * NOTE: the "at most three cards" rule is a domain invariant enforced by the
 * solver (W04), not by this schema. The schema deliberately does not cap
 * `cards.length` so a solver bug is observable in tests rather than silently
 * masked at the boundary.
 */

function validDecision(): RecoveryDecision {
  return {
    sessionId: "sess_1",
    route: "RECOVER",
    strategy: "EXACT_ALTERNATIVE",
    activationReasons: ["native search returned zero results"],
    constraints: [
      {
        kind: "category",
        value: "dress",
        hardness: "hard",
        sourceText: "I need a dress",
      },
      {
        kind: "price_max",
        value: 120,
        hardness: "soft",
        sourceText: "under $120",
      },
    ],
    cards: [
      {
        productId: "p_1",
        variantId: "v_1",
        handle: "floral-midi-dress",
        title: "Floral Midi Dress",
        imageUrl: "https://example.com/dress.jpg",
        price: 89,
        available: true,
        selectedOptions: [
          { name: "Size", value: "M" },
          { name: "Color", value: "Blue" },
        ],
        matchScore: 0.92,
        satisfied: ["category"],
        relaxedSoft: ["price_max"],
        unknown: [],
        reason: "Matches category; price preference relaxed and disclosed.",
        rank: 1,
      },
    ],
    rejectedCandidates: [
      {
        productId: "p_2",
        reasons: ["price exceeds hard maximum"],
        classification: "HARD_CONSTRAINT_VIOLATION",
      },
    ],
    refinementPrompt: null,
    refinementOptions: [],
  };
}

test("valid RecoveryDecision parses", () => {
  const result = RecoveryDecisionSchema.safeParse(validDecision());
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.route, "RECOVER");
    assert.equal(result.data.cards.length, 1);
  }
});

test("invalid route is rejected", () => {
  const decision = validDecision();
  // @ts-expect-error intentionally invalid route value
  decision.route = "PADD";
  const result = RecoveryDecisionSchema.safeParse(decision);
  assert.equal(result.success, false);
});

test("missing hard field is rejected", () => {
  const decision = validDecision();
  // @ts-expect-error intentionally dropping a required field
  delete decision.cards[0].productId;
  const result = RecoveryDecisionSchema.safeParse(decision);
  assert.equal(result.success, false);
});
