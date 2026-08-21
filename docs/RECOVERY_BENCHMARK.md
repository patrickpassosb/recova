# Recovery Benchmark

The recovery benchmark is a curated, machine-readable dataset that CI evaluates
retrieval/ranking changes against. It is the product-quality oracle for the
~10,000-product fashion catalog: the objective is to prove Recova remains
correct and useful when thousands of plausible alternatives exist.

## Fixture format

The benchmark is a JSONL file, one JSON object per line. Each line is a single
query fixture with the following fields:

```json
{
  "query": "string — the raw shopper query",
  "expectedRoute": "NATIVE_OK | RECOVER | CLARIFY",
  "hardConstraints": [
    { "kind": "category", "value": "dress", "sourceText": "I need a dress" }
  ],
  "softConstraints": [
    { "kind": "price_max", "value": 120, "sourceText": "under $120" }
  ],
  "acceptableProductIds": ["p_1", "p_2"],
  "forbiddenProductIds": ["p_3"],
  "expectedCardCount": "number | null — exact card count when deterministic (e.g. 0 for NATIVE_OK / no-valid-candidate); null when open-ended",
  "expectedRejectedCandidates": [
    { "productId": "p_3", "classification": "HARD_CONSTRAINT_VIOLATION | UNAVAILABLE | INSUFFICIENT_EVIDENCE | POLICY_BLOCK" }
  ],
  "expectedDispositions": [
    { "kind": "size", "disposition": "satisfied | relaxed | unknown" }
  ],
  "nativeResultIds": ["p_9"],
  "adapterResultIds": ["p_1", "p_2", "p_3", "p_9"],
  "merchantConfig": { "storeId": "fixture-store", "invalid": false },
  "expectedExtraction": [
    { "kind": "price_max", "value": 120, "hardness": "hard" }
  ]
}
```

### Field semantics

- **`query`** — the raw shopper query, exactly as a shopper would type it.
- **`expectedRoute`** — the route the solver must produce (`NATIVE_OK`,
  `RECOVER`, or `CLARIFY`).
- **`hardConstraints`** / **`softConstraints`** — the constraints the solver is
  expected to extract. `kind` uses the `ConstraintKind` enum (`category`,
  `price_max`, `size`, `color`, `compatibility`, `intended_use`). `value` is a
  string or number. `sourceText` is the query fragment that produced it.
- **`acceptableProductIds`** — the set of product IDs that are valid answers.
  A pass requires every returned card's `productId` to be in this set (or, for
  open-ended fixtures, the set may be empty to mean "any grounded result").
- **`forbiddenProductIds`** — product IDs that must never appear in the
  returned cards. Used for adversarial cases (cross-category distractors,
  near-matches, out-of-stock variants, soft-preference-only matches that
  violate a hard constraint).
- **`expectedStrategy`** — the recovery strategy the solver should choose, or
  `null` when the route is not `RECOVER`.
- **`expectedClarification`** — the clarification topic when the route is
  `CLARIFY`, or `null` otherwise.
- **`expectedCardCount`** — exact card count when deterministic; `0` for
  `NATIVE_OK` and no-valid-candidate fixtures, `null` when open-ended.
- **`expectedRejectedCandidates`** — rejected products and their
  classifications (`HARD_CONSTRAINT_VIOLATION`, `UNAVAILABLE`,
  `INSUFFICIENT_EVIDENCE`, `POLICY_BLOCK`). Encodes
  `route.constraint-violating-native`.
- **`expectedDispositions`** — per-constraint expected placement on the card:
  `satisfied`, `relaxed`, or `unknown`. Encodes
  `cards.unknown-stays-unknown` and `soft-relaxation.explicit`.
- **`nativeResultIds`** — product IDs the Native search stub returns for this
  fixture. NATIVE_OK fixtures require `expectedCardCount: 0` and a strong
  candidate here.
- **`adapterResultIds`** — product IDs the CatalogAdapter stub returns. The
  universe the solver may select from; encodes `ids.no-llm-invention`
  (any emitted ID not in this set fails the fixture).
- **`merchantConfig`** — optional merchant-config fixture; `"invalid": true`
  encodes `merchant.fail-safe` (config must be rejected at the boundary).
- **`expectedExtraction`** — normalized constraints the extractor must produce
  for this query; encodes the `extract.*` acceptance rows
  (price, size, color, synonyms, compatibility, intended use).

## How CI consumes it

1. **Load** the JSONL file and parse each line into a fixture object.
2. **Run** the deterministic solver (and, in the bounded real-Gemini run, the
   agent) against each `query` over the ~10,000-product catalog.
3. **Assert** per fixture:
   - `route === expectedRoute`;
   - every returned card's `productId` is in `acceptableProductIds` (when the
     set is non-empty);
   - no returned card's `productId` is in `forbiddenProductIds`;
   - every hard constraint is satisfied by every card (see
     `docs/ACCEPTANCE_MATRIX.md` `hard-constraint.enforcement`);
   - `cards.length === expectedCardCount` (when non-null);
   - rejected-candidate set and classifications match
     `expectedRejectedCandidates`;
   - per-card constraint dispositions match `expectedDispositions`;
   - every emitted ID is in `adapterResultIds`;
   - extracted constraints match `expectedExtraction` (when present);
   - invalid `merchantConfig` fixtures are rejected, not silently defaulted;
   - `strategy === expectedStrategy` (when the route is `RECOVER`);
   - clarification behavior matches `expectedClarification` (when the route is
     `CLARIFY`).
4. **Report** a per-fixture pass/fail and a summary. Any regression in
   retrieval/ranking that flips a fixture from pass to fail blocks the change.

Both the stubbed deterministic run and the bounded real-Gemini 3.7 run are
evaluated against the same oracle, so the benchmark is the single source of
truth for correctness.

## Adversarial coverage requirements

The benchmark must include fixtures that exercise:

- cross-category distractors (a superficially related product that must be
  rejected);
- multiple candidates competing on price, size, color, intended use, and
  availability;
- out-of-stock and unknown-evidence variants that must not be silently
  upgraded to valid matches;
- near-matches that satisfy soft preferences while violating a hard
  constraint (must be in `forbiddenProductIds`);
- ambiguous intent that requires clarification;
- no-valid-candidate cases that must not be padded.

## Acceptance-matrix coverage mapping

Every matrix row must have at least one fixture that exercises it:

| Acceptance ID | Required fixture fields |
|---|---|
| `route.native-ok` | `nativeResultIds` (strong candidate) + `expectedCardCount: 0` |
| `route.zero-results` | `nativeResultIds: []` + non-empty `acceptableProductIds` |
| `route.constraint-violating-native` | `nativeResultIds` with offender + `expectedRejectedCandidates` (`HARD_CONSTRAINT_VIOLATION`) |
| `route.ambiguous-intent` | `expectedClarification` |
| `route.no-valid-candidate` | `acceptableProductIds: []` + `expectedCardCount: 0` |
| `hard-constraint.*` | `expectedDispositions` |
| `cards.max-3` | `acceptableProductIds` with >3 members + `expectedCardCount: 3` |
| `cards.no-bestseller-padding` | every card ID ∈ `acceptableProductIds ∪ nativeResultIds` |
| `cards.unknown-stays-unknown` | `expectedDispositions` with `unknown` entries |
| `ids.no-llm-invention` | `adapterResultIds` as the closed universe |
| `merchant.fail-safe` | `merchantConfig.invalid: true` |
| `extract.*` | `expectedExtraction` |
