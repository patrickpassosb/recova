import type {
  ConstraintKind,
  DecisionCard,
  RecoveryDecision,
  RecoveryStrategy,
  RejectedCandidate,
  ShopperConstraint,
} from "./schemas.js";
import {
  buildDecisionCards,
  type CatalogCandidate,
  type CandidateEvaluation,
} from "./cards.js";

/**
 * Deterministic recovery solver.
 *
 * `route(nativeResultIds, adapterCandidates, constraints)` is the authority
 * over routing and hard-constraint enforcement:
 *
 *   - NATIVE_OK  — at least one native result satisfies every hard constraint
 *                  with no unknown-hard evidence issues.
 *   - RECOVER    — native results are empty or violate a hard constraint AND at
 *                  least one valid adapter candidate exists.
 *   - CLARIFY    — intent is ambiguous or zero valid candidates exist.
 *
 * The solver never invents IDs: every emitted product/variant ID is asserted
 * to be in the adapter result universe (a `DomainInvariantError` is thrown
 * otherwise). It never pads results to reach a count.
 */

/** Thrown when a domain invariant is violated (e.g. an invented ID). */
export class DomainInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainInvariantError";
  }
}

function groupByKind(
  constraints: ShopperConstraint[],
): Map<ConstraintKind, ShopperConstraint[]> {
  const map = new Map<ConstraintKind, ShopperConstraint[]>();
  for (const c of constraints) {
    const list = map.get(c.kind) ?? [];
    list.push(c);
    map.set(c.kind, list);
  }
  return map;
}

function matchExact(
  attr: string | undefined,
  values: string[],
): "satisfied" | "violated" | "unknown" {
  if (attr === undefined || attr === null || attr === "") return "unknown";
  const normalized = attr.toLowerCase();
  return values.some((v) => v.toLowerCase() === normalized)
    ? "satisfied"
    : "violated";
}

function matchContains(
  attr: string | undefined,
  values: string[],
): "satisfied" | "violated" | "unknown" {
  if (attr === undefined || attr === null || attr === "") return "unknown";
  const normalized = attr.toLowerCase();
  return values.some((v) => {
    const vn = v.toLowerCase();
    return normalized.includes(vn) || vn.includes(normalized);
  })
    ? "satisfied"
    : "violated";
}

function evaluateConstraint(
  candidate: CatalogCandidate,
  kind: ConstraintKind,
  constraint: ShopperConstraint,
): "satisfied" | "violated" | "unknown" {
  switch (kind) {
    case "category":
      return matchExact(candidate.attributes.category, [String(constraint.value)]);
    case "price_max":
      return candidate.price <= Number(constraint.value) ? "satisfied" : "violated";
    case "size":
      return matchExact(candidate.attributes.size, [String(constraint.value)]);
    case "color":
      return matchExact(candidate.attributes.color, [String(constraint.value)]);
    case "compatibility":
      return matchContains(candidate.attributes.compatibility, [String(constraint.value)]);
    case "intended_use":
      return matchContains(candidate.attributes.intendedUse, [String(constraint.value)]);
  }
}

/**
 * Evaluate a single candidate against the shopper's constraints. Hard
 * constraints with unknown evidence are treated as insufficient evidence
 * (unknown stays unknown) rather than silently satisfied.
 */
export function evaluateCandidate(
  candidate: CatalogCandidate,
  constraints: ShopperConstraint[],
): CandidateEvaluation {
  const satisfied: ConstraintKind[] = [];
  const relaxedSoft: ConstraintKind[] = [];
  const unknown: ConstraintKind[] = [];
  const reasons: string[] = [];
  let classification: RejectedCandidate["classification"] | null = null;

  if (!candidate.available) {
    return {
      candidate,
      valid: false,
      satisfied,
      relaxedSoft,
      unknown,
      rejection: {
        productId: candidate.productId,
        variantId: candidate.variantId,
        reasons: ["product is unavailable"],
        classification: "UNAVAILABLE",
      },
    };
  }

  const byKind = groupByKind(constraints);

  for (const [kind, list] of byKind) {
    let hardViolated = false;
    let hardUnknown = false;
    let softViolated = false;
    let softUnknown = false;

    for (const constraint of list) {
      const disposition = evaluateConstraint(candidate, kind, constraint);
      if (disposition === "violated") {
        if (constraint.hardness === "hard") hardViolated = true;
        else softViolated = true;
      } else if (disposition === "unknown") {
        if (constraint.hardness === "hard") hardUnknown = true;
        else softUnknown = true;
      }
    }

    if (hardViolated) {
      reasons.push(`${kind} constraint violated`);
      classification = "HARD_CONSTRAINT_VIOLATION";
    } else if (hardUnknown) {
      unknown.push(kind);
      reasons.push(`insufficient evidence for ${kind}`);
      if (classification === null) classification = "INSUFFICIENT_EVIDENCE";
    } else if (softViolated) {
      relaxedSoft.push(kind);
    } else if (softUnknown) {
      unknown.push(kind);
    } else {
      satisfied.push(kind);
    }
  }

  const valid = classification === null;
  return {
    candidate,
    valid,
    satisfied,
    relaxedSoft,
    unknown,
    rejection: valid
      ? null
      : {
          productId: candidate.productId,
          variantId: candidate.variantId,
          reasons,
          classification: classification!,
        },
  };
}

/**
 * Partition candidates into valid evaluations and rejected candidates.
 * Rejections are classified as HARD_CONSTRAINT_VIOLATION, UNAVAILABLE, or
 * INSUFFICIENT_EVIDENCE.
 */
export function validateCandidates(
  candidates: CatalogCandidate[],
  constraints: ShopperConstraint[],
): { valid: CandidateEvaluation[]; rejected: RejectedCandidate[] } {
  const valid: CandidateEvaluation[] = [];
  const rejected: RejectedCandidate[] = [];
  for (const c of candidates) {
    const ev = evaluateCandidate(c, constraints);
    if (ev.valid) valid.push(ev);
    else rejected.push(ev.rejection!);
  }
  return { valid, rejected };
}

/**
 * Intent is ambiguous when no constraints were extracted, or when two or more
 * distinct hard values conflict for the same non-price kind.
 */
export function isAmbiguousIntent(constraints: ShopperConstraint[]): boolean {
  if (constraints.length === 0) return true;
  const byKind = groupByKind(constraints);
  for (const [kind, list] of byKind) {
    if (kind === "price_max") continue; // multiple ceilings collapse to min
    const hardValues = new Set(
      list
        .filter((c) => c.hardness === "hard")
        .map((c) => String(c.value).toLowerCase()),
    );
    if (hardValues.size > 1) return true;
  }
  return false;
}

/**
 * Select a recovery strategy (plan §3.2). Deterministic:
 *   - native empty → QUERY_REPAIR
 *   - soft preferences relaxed → SOFT_PREFERENCE_RELAXATION
 *   - otherwise → EXACT_ALTERNATIVE
 */
export function selectStrategy(
  nativeResultIds: string[],
  cards: DecisionCard[],
): RecoveryStrategy {
  if (nativeResultIds.length === 0) return "QUERY_REPAIR";
  if (cards.some((c) => c.relaxedSoft.length > 0)) {
    return "SOFT_PREFERENCE_RELAXATION";
  }
  return "EXACT_ALTERNATIVE";
}

/**
 * Product/variant identity universe used for ID-grounding assertions. Product
 * IDs and variant IDs are tracked separately so a variant can never be emitted
 * in a product's role (or vice versa), and each variant is validated to belong
 * to the product it is emitted with.
 */
export interface IdUniverse {
  productIds: Set<string>;
  variantIds: Set<string>;
  /** Maps each variant ID to the product ID it belongs to. */
  variantToProduct: Map<string, string>;
}

export function buildUniverse(candidates: CatalogCandidate[]): IdUniverse {
  const productIds = new Set<string>();
  const variantIds = new Set<string>();
  const variantToProduct = new Map<string, string>();
  for (const c of candidates) {
    productIds.add(c.productId);
    variantIds.add(c.variantId);
    variantToProduct.set(c.variantId, c.productId);
  }
  return { productIds, variantIds, variantToProduct };
}

/**
 * Assert every emitted product/variant ID is in the adapter result universe
 * and that each emitted variant belongs to the emitted product. Throws
 * `DomainInvariantError` otherwise. Exported so the invariant can be tested
 * directly (the solver never invents IDs).
 */
export function assertIdsInUniverse(
  decision: RecoveryDecision,
  universe: IdUniverse,
): void {
  for (const card of decision.cards) {
    if (!universe.productIds.has(card.productId)) {
      throw new DomainInvariantError(
        `card productId ${card.productId} not in adapter universe`,
      );
    }
    if (!universe.variantIds.has(card.variantId)) {
      throw new DomainInvariantError(
        `card variantId ${card.variantId} not in adapter universe`,
      );
    }
    if (universe.variantToProduct.get(card.variantId) !== card.productId) {
      throw new DomainInvariantError(
        `card variantId ${card.variantId} does not belong to productId ${card.productId}`,
      );
    }
  }
  for (const r of decision.rejectedCandidates) {
    if (!universe.productIds.has(r.productId)) {
      throw new DomainInvariantError(
        `rejected productId ${r.productId} not in adapter universe`,
      );
    }
    if (r.variantId) {
      if (!universe.variantIds.has(r.variantId)) {
        throw new DomainInvariantError(
          `rejected variantId ${r.variantId} not in adapter universe`,
        );
      }
      if (universe.variantToProduct.get(r.variantId) !== r.productId) {
        throw new DomainInvariantError(
          `rejected variantId ${r.variantId} does not belong to productId ${r.productId}`,
        );
      }
    }
  }
}

function buildActivationReasons(
  nativeResultIds: string[],
  constraints: ShopperConstraint[],
): string[] {
  if (nativeResultIds.length === 0) {
    return ["native search returned zero results"];
  }
  return ["native results violate hard constraints"];
}

function makeClarify(
  sessionId: string,
  constraints: ShopperConstraint[],
  rejected: RejectedCandidate[],
  activationReasons: string[],
  refinementPrompt: string,
  refinementOptions: string[],
): RecoveryDecision {
  return {
    sessionId,
    route: "CLARIFY",
    strategy: null,
    activationReasons,
    constraints,
    cards: [],
    rejectedCandidates: rejected,
    refinementPrompt,
    refinementOptions,
  };
}

/**
 * Route a recovery decision. See the module docstring for the routing rules.
 */
export function route(
  nativeResultIds: string[],
  adapterCandidates: CatalogCandidate[],
  constraints: ShopperConstraint[],
  options: { sessionId?: string } = {},
): RecoveryDecision {
  const sessionId = options.sessionId ?? "session";
  const universe = buildUniverse(adapterCandidates);

  // 1. Ambiguous intent → clarify.
  if (isAmbiguousIntent(constraints)) {
    const decision = makeClarify(
      sessionId,
      constraints,
      [],
      ["shopper intent is ambiguous"],
      "Could you tell me more about what you're looking for?",
      ["What category of item?", "What's your budget?", "What size or color?"],
    );
    assertIdsInUniverse(decision, universe);
    return decision;
  }

  // 2. Native OK → stay hidden.
  const nativeCandidates = adapterCandidates.filter((c) =>
    nativeResultIds.includes(c.productId),
  );
  const nativeOk = nativeCandidates.some(
    (c) => evaluateCandidate(c, constraints).valid,
  );
  if (nativeOk) {
    const decision: RecoveryDecision = {
      sessionId,
      route: "NATIVE_OK",
      strategy: null,
      activationReasons: [],
      constraints,
      cards: [],
      rejectedCandidates: [],
      refinementPrompt: null,
      refinementOptions: [],
    };
    assertIdsInUniverse(decision, universe);
    return decision;
  }

  // 3. Recover with valid adapter candidates.
  const { valid, rejected } = validateCandidates(adapterCandidates, constraints);
  if (valid.length >= 1) {
    const cards = buildDecisionCards(valid, constraints);
    const strategy = selectStrategy(nativeResultIds, cards);
    const decision: RecoveryDecision = {
      sessionId,
      route: "RECOVER",
      strategy,
      activationReasons: buildActivationReasons(nativeResultIds, constraints),
      constraints,
      cards,
      rejectedCandidates: rejected,
      refinementPrompt: null,
      refinementOptions: [],
    };
    assertIdsInUniverse(decision, universe);
    return decision;
  }

  // 4. Zero valid candidates → clarify (no padding).
  const decision = makeClarify(
    sessionId,
    constraints,
    rejected,
    ["no valid candidate satisfies the shopper's constraints"],
    "I couldn't find a match for your request. Could you adjust your constraints?",
    ["Relax a constraint", "Try a different category"],
  );
  assertIdsInUniverse(decision, universe);
  return decision;
}
