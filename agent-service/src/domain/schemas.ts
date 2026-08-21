import { z } from "zod";

/**
 * Domain contracts for the Recova recovery agent.
 *
 * These Zod schemas model the core contracts in `docs/PLAN_FINAL.md` §4
 * (RecoveryRoute, RecoveryStrategy, ConstraintKind, ShopperConstraint,
 * RejectedCandidate, DecisionCard, RecoveryDecision) plus the SessionEvent
 * envelope and the MerchantConfig skeleton from §3.8.
 *
 * Zod is used at every HTTP, ADK tool, Firestore, Pub/Sub, webhook,
 * workflow-output, and UI boundary so that malformed or fabricated data is
 * rejected before it can enter the domain.
 */

/**
 * The three possible recovery routes.
 *
 * - `NATIVE_OK`: the native search result is already correct; Recova stays hidden.
 * - `RECOVER`: native results are missing or invalid; Recova proposes grounded alternatives.
 * - `CLARIFY`: intent is ambiguous or no valid candidate exists; Recova asks one targeted question.
 */
export const RecoveryRouteSchema = z.enum(["NATIVE_OK", "RECOVER", "CLARIFY"]);
export type RecoveryRoute = z.infer<typeof RecoveryRouteSchema>;

/**
 * How recovery occurs when the route is `RECOVER`.
 *
 * `NO_VALID_RECOVERY` is a terminal strategy: no valid candidate exists and
 * Recova clarifies or exits instead of padding results.
 */
export const RecoveryStrategySchema = z.enum([
  "EXACT_ALTERNATIVE",
  "VARIANT_RECOVERY",
  "SOFT_PREFERENCE_RELAXATION",
  "QUERY_REPAIR",
  "BUNDLE_RECOVERY",
  "NO_VALID_RECOVERY",
]);
export type RecoveryStrategy = z.infer<typeof RecoveryStrategySchema>;

/**
 * The kinds of constraints a shopper can express.
 */
export const ConstraintKindSchema = z.enum([
  "category",
  "price_max",
  "size",
  "color",
  "compatibility",
  "intended_use",
]);
export type ConstraintKind = z.infer<typeof ConstraintKindSchema>;

/**
 * A single shopper constraint extracted from the query.
 *
 * `hardness` distinguishes hard constraints (must be satisfied) from soft
 * preferences (may be relaxed, but only with explicit disclosure).
 */
export const ShopperConstraintSchema = z.object({
  kind: ConstraintKindSchema,
  value: z.union([z.string(), z.number()]),
  hardness: z.enum(["hard", "soft"]),
  sourceText: z.string(),
});
export type ShopperConstraint = z.infer<typeof ShopperConstraintSchema>;

/**
 * A candidate that was considered and rejected, with the reason why.
 *
 * `classification` is a closed set so downstream analytics and audits can
 * reason about rejection causes deterministically.
 */
export const RejectedCandidateSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  reasons: z.array(z.string()),
  classification: z.enum([
    "HARD_CONSTRAINT_VIOLATION",
    "UNAVAILABLE",
    "INSUFFICIENT_EVIDENCE",
    "POLICY_BLOCK",
  ]),
});
export type RejectedCandidate = z.infer<typeof RejectedCandidateSchema>;

/**
 * A single grounded Decision Card shown to the shopper.
 *
 * `satisfied`, `relaxedSoft`, and `unknown` partition the constraint kinds so
 * that unknown evidence is shown as unknown rather than silently upgraded.
 */
export const DecisionCardSchema = z.object({
  productId: z.string(),
  variantId: z.string(),
  handle: z.string(),
  title: z.string(),
  imageUrl: z.string().nullable(),
  price: z.number(),
  available: z.boolean(),
  selectedOptions: z.array(z.object({ name: z.string(), value: z.string() })),
  matchScore: z.number(),
  satisfied: z.array(ConstraintKindSchema),
  relaxedSoft: z.array(ConstraintKindSchema),
  unknown: z.array(ConstraintKindSchema),
  reason: z.string(),
  rank: z.number(),
});
export type DecisionCard = z.infer<typeof DecisionCardSchema>;

/**
 * The full recovery decision returned by the domain solver.
 *
 * NOTE: the "at most three cards" rule is a domain invariant enforced by the
 * solver (W04), not by this schema. The schema intentionally does not cap
 * `cards.length` so that a solver bug is observable in tests rather than
 * silently masked at the boundary.
 */
export const RecoveryDecisionSchema = z.object({
  sessionId: z.string(),
  route: RecoveryRouteSchema,
  strategy: RecoveryStrategySchema.nullable(),
  activationReasons: z.array(z.string()),
  constraints: z.array(ShopperConstraintSchema),
  cards: z.array(DecisionCardSchema),
  rejectedCandidates: z.array(RejectedCandidateSchema),
  refinementPrompt: z.string().nullable(),
  refinementOptions: z.array(z.string()),
});
export type RecoveryDecision = z.infer<typeof RecoveryDecisionSchema>;

/**
 * Envelope for every session-scoped event (recovery, refinement, attribution,
 * repair, analytics). All events are scoped by `storeId` and `sessionId` for
 * tenant isolation.
 */
export const SessionEventSchema = z.object({
  eventId: z.string(),
  storeId: z.string(),
  sessionId: z.string(),
  type: z.string(),
  payload: z.unknown(),
  occurredAt: z.string(),
});
export type SessionEvent = z.infer<typeof SessionEventSchema>;

/**
 * Server-controlled merchant configuration (skeleton from §3.8).
 *
 * Client input may never select arbitrary stores or secret-bearing connector
 * configuration; this object is provisioned and controlled server-side.
 */
export const MerchantConfigSchema = z.object({
  storeId: z.string(),
  catalogAdapter: z.string(),
  commerceAdapter: z.string(),
  branding: z.record(z.string(), z.unknown()),
  enabledStrategies: z.array(RecoveryStrategySchema),
  repairPermissions: z.record(z.string(), z.unknown()),
  modelLimits: z.record(z.string(), z.unknown()),
  attribution: z.record(z.string(), z.unknown()),
  featureFlags: z.record(z.string(), z.unknown()),
});
export type MerchantConfig = z.infer<typeof MerchantConfigSchema>;
