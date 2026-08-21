import type {
  ConstraintKind,
  DecisionCard,
  RejectedCandidate,
  ShopperConstraint,
} from "./schemas.js";

/**
 * Decision Card construction (deterministic).
 *
 * `buildDecisionCards` turns already-validated candidate evaluations into at
 * most three grounded `DecisionCard`s, ranked by constraint satisfaction and
 * then by a deterministic tiebreak (price ascending, then productId). Unknown
 * evidence is surfaced in `unknown`; relaxed soft preferences are surfaced in
 * `relaxedSoft` and disclosed in the card `reason`.
 */

/** Catalog attributes a candidate may carry (evidence for constraint kinds). */
export interface CandidateAttributes {
  category?: string;
  size?: string;
  color?: string;
  compatibility?: string;
  intendedUse?: string;
}

/** A single catalog/adapter result (product + variant). */
export interface CatalogCandidate {
  productId: string;
  variantId: string;
  handle: string;
  title: string;
  imageUrl: string | null;
  price: number;
  available: boolean;
  selectedOptions: Array<{ name: string; value: string }>;
  attributes: CandidateAttributes;
}

/**
 * The result of evaluating a candidate against the shopper's constraints.
 * `valid` candidates satisfy every hard constraint with evidence; `rejection`
 * is populated for invalid candidates.
 */
export interface CandidateEvaluation {
  candidate: CatalogCandidate;
  valid: boolean;
  satisfied: ConstraintKind[];
  relaxedSoft: ConstraintKind[];
  unknown: ConstraintKind[];
  rejection: RejectedCandidate | null;
}

function computeMatchScore(
  evaluation: CandidateEvaluation,
  constraints: ShopperConstraint[],
): number {
  const kinds = new Set(constraints.map((c) => c.kind));
  let score = 0;
  let total = 0;
  for (const kind of kinds) {
    const isHard = constraints.some(
      (c) => c.kind === kind && c.hardness === "hard",
    );
    const weight = isHard ? 2 : 1;
    total += weight;
    if (evaluation.satisfied.includes(kind)) score += weight;
    // relaxed soft and unknown contribute no score
  }
  return total === 0 ? 0 : score / total;
}

function buildReason(
  evaluation: CandidateEvaluation,
  constraints: ShopperConstraint[],
): string {
  const parts: string[] = [];
  if (evaluation.satisfied.length) {
    parts.push(`satisfies ${evaluation.satisfied.join(", ")}`);
  }
  if (evaluation.relaxedSoft.length) {
    parts.push(`relaxes soft preference ${evaluation.relaxedSoft.join(", ")}`);
  }
  if (evaluation.unknown.length) {
    parts.push(`unknown evidence for ${evaluation.unknown.join(", ")}`);
  }
  return parts.length ? parts.join("; ") : "matches constraints";
}

/**
 * Build at most three Decision Cards from valid candidate evaluations, ranked
 * by constraint satisfaction then deterministic tiebreak (price, productId).
 */
export function buildDecisionCards(
  evaluations: CandidateEvaluation[],
  constraints: ShopperConstraint[],
): DecisionCard[] {
  const valid = evaluations.filter((e) => e.valid);

  const ranked = valid
    .map((e) => ({ e, score: computeMatchScore(e, constraints) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.e.candidate.price !== b.e.candidate.price) {
        return a.e.candidate.price - b.e.candidate.price;
      }
      return a.e.candidate.productId.localeCompare(b.e.candidate.productId);
    })
    .slice(0, 3);

  return ranked.map(({ e, score }, i) => {
    const c = e.candidate;
    return {
      productId: c.productId,
      variantId: c.variantId,
      handle: c.handle,
      title: c.title,
      imageUrl: c.imageUrl,
      price: c.price,
      available: c.available,
      selectedOptions: c.selectedOptions,
      matchScore: score,
      satisfied: e.satisfied,
      relaxedSoft: e.relaxedSoft,
      unknown: e.unknown,
      reason: buildReason(e, constraints),
      rank: i + 1,
    };
  });
}
