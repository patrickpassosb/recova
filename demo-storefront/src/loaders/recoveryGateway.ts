/**
 * Recovery gateway loader (W09 — V2 vertical slice).
 *
 * Server-side proxy to the Recova recovery agent's HTTP API. The browser never
 * talks to the agent directly: this loader POSTs to
 * `{AGENT_URL}/v1/recovery/evaluate` and returns the Zod-validated
 * `RecoveryDecision` (the plan contract, docs/PLAN_FINAL.md §4).
 *
 * The V2 `RecoveryDecision` shape is mirrored here as plain TypeScript types
 * (no cross-repo imports) so the storefront stays decoupled from the agent
 * service. Only the plan contract is exposed to the client — never card
 * internals beyond it.
 *
 * Failure is silent: any network error, timeout, or non-2xx response resolves
 * to `null` so the native search results are never degraded by a recovery
 * outage.
 */

export type RecoveryRoute = "NATIVE_OK" | "RECOVER" | "CLARIFY";

export type RecoveryStrategy =
  | "EXACT_ALTERNATIVE"
  | "VARIANT_RECOVERY"
  | "SOFT_PREFERENCE_RELAXATION"
  | "QUERY_REPAIR"
  | "BUNDLE_RECOVERY"
  | "NO_VALID_RECOVERY";

export type ConstraintKind =
  | "category"
  | "price_max"
  | "size"
  | "color"
  | "compatibility"
  | "intended_use";

export interface ShopperConstraint {
  kind: ConstraintKind;
  value: string | number;
  hardness: "hard" | "soft";
  sourceText: string;
}

export interface RejectedCandidate {
  productId: string;
  variantId?: string;
  reasons: string[];
  classification:
    | "HARD_CONSTRAINT_VIOLATION"
    | "UNAVAILABLE"
    | "INSUFFICIENT_EVIDENCE"
    | "POLICY_BLOCK";
}

export interface DecisionCard {
  productId: string;
  variantId: string;
  handle: string;
  title: string;
  imageUrl: string | null;
  price: number;
  available: boolean;
  selectedOptions: Array<{ name: string; value: string }>;
  matchScore: number;
  satisfied: ConstraintKind[];
  relaxedSoft: ConstraintKind[];
  unknown: ConstraintKind[];
  reason: string;
  rank: number;
}

export interface RecoveryDecision {
  sessionId: string;
  route: RecoveryRoute;
  strategy: RecoveryStrategy | null;
  activationReasons: string[];
  constraints: ShopperConstraint[];
  cards: DecisionCard[];
  rejectedCandidates: RejectedCandidate[];
  refinementPrompt: string | null;
  refinementOptions: string[];
}

export interface Props {
  /** Shopper query that failed native search. */
  query: string;
  /** Native result IDs (empty when native search returned zero results). */
  nativeResultIds?: string[];
}

const DEFAULT_AGENT_URL = "http://localhost:8080";
const REQUEST_TIMEOUT_MS = 2500;

/**
 * Runtime validation of the recovery response.
 *
 * The agent service validates its own output with the Zod schemas in
 * `agent-service/src/domain/schemas.ts`, but the storefront boundary must not
 * trust that: a 2xx response is still arbitrary JSON. We mirror the plan
 * contract here as plain type guards (no cross-repo imports) and reject any
 * payload that does not match, so a malformed 2xx can never reach
 * `DecisionCards` and crash the zero-results view.
 */

const RECOVERY_ROUTES = new Set<RecoveryRoute>(["NATIVE_OK", "RECOVER", "CLARIFY"]);
const RECOVERY_STRATEGIES = new Set<RecoveryStrategy>([
  "EXACT_ALTERNATIVE",
  "VARIANT_RECOVERY",
  "SOFT_PREFERENCE_RELAXATION",
  "QUERY_REPAIR",
  "BUNDLE_RECOVERY",
  "NO_VALID_RECOVERY",
]);
const CONSTRAINT_KINDS = new Set<ConstraintKind>([
  "category",
  "price_max",
  "size",
  "color",
  "compatibility",
  "intended_use",
]);
const REJECTION_CLASSIFICATIONS = new Set<RejectedCandidate["classification"]>([
  "HARD_CONSTRAINT_VIOLATION",
  "UNAVAILABLE",
  "INSUFFICIENT_EVIDENCE",
  "POLICY_BLOCK",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isConstraintKind(value: unknown): value is ConstraintKind {
  return isString(value) && CONSTRAINT_KINDS.has(value as ConstraintKind);
}

function isShopperConstraint(value: unknown): value is ShopperConstraint {
  if (!isRecord(value)) return false;
  return (
    isConstraintKind(value.kind) &&
    (isString(value.value) || isNumber(value.value)) &&
    (value.hardness === "hard" || value.hardness === "soft") &&
    isString(value.sourceText)
  );
}

function isRejectedCandidate(value: unknown): value is RejectedCandidate {
  if (!isRecord(value)) return false;
  return (
    isString(value.productId) &&
    (value.variantId === undefined || isString(value.variantId)) &&
    isStringArray(value.reasons) &&
    isString(value.classification) &&
    REJECTION_CLASSIFICATIONS.has(value.classification as RejectedCandidate["classification"])
  );
}

function isDecisionCard(value: unknown): value is DecisionCard {
  if (!isRecord(value)) return false;
  return (
    isString(value.productId) &&
    isString(value.variantId) &&
    isString(value.handle) &&
    isString(value.title) &&
    (value.imageUrl === null || isString(value.imageUrl)) &&
    isNumber(value.price) &&
    isBoolean(value.available) &&
    Array.isArray(value.selectedOptions) &&
    value.selectedOptions.every(
      (option) => isRecord(option) && isString(option.name) && isString(option.value),
    ) &&
    isNumber(value.matchScore) &&
    Array.isArray(value.satisfied) &&
    value.satisfied.every(isConstraintKind) &&
    Array.isArray(value.relaxedSoft) &&
    value.relaxedSoft.every(isConstraintKind) &&
    Array.isArray(value.unknown) &&
    value.unknown.every(isConstraintKind) &&
    isString(value.reason) &&
    isNumber(value.rank)
  );
}

/** Returns the validated decision, or `null` when the payload is malformed. */
function parseRecoveryDecision(value: unknown): RecoveryDecision | null {
  if (!isRecord(value)) return null;
  if (!isString(value.sessionId)) return null;
  if (!isString(value.route) || !RECOVERY_ROUTES.has(value.route as RecoveryRoute)) return null;
  if (
    value.strategy !== null &&
    !(isString(value.strategy) && RECOVERY_STRATEGIES.has(value.strategy as RecoveryStrategy))
  ) {
    return null;
  }
  if (!isStringArray(value.activationReasons)) return null;
  if (!Array.isArray(value.constraints) || !value.constraints.every(isShopperConstraint)) {
    return null;
  }
  if (!Array.isArray(value.cards) || !value.cards.every(isDecisionCard)) return null;
  if (
    !Array.isArray(value.rejectedCandidates) ||
    !value.rejectedCandidates.every(isRejectedCandidate)
  ) {
    return null;
  }
  if (value.refinementPrompt !== null && !isString(value.refinementPrompt)) return null;
  if (!isStringArray(value.refinementOptions)) return null;
  return value as unknown as RecoveryDecision;
}

/** Resolve the agent base URL from `AGENT_URL`, defaulting to localhost. */
function agentUrl(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env?.AGENT_URL?.trim() || DEFAULT_AGENT_URL;
}

export default async function recoveryGateway({
  query,
  nativeResultIds = [],
}: Props): Promise<RecoveryDecision | null> {
  if (!query) return null;

  try {
    const res = await fetch(`${agentUrl()}/v1/recovery/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: "demo", query, nativeResultIds }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) return null;
    return parseRecoveryDecision(await res.json());
  } catch (err) {
    console.error("[recoveryGateway]", err);
    return null;
  }
}
