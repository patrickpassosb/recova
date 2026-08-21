# Acceptance Matrix

Machine-usable acceptance matrix distilled from `docs/PLAN_FINAL.md` §10
(Test and acceptance matrix). Each row is a checkable invariant with a stable
`id`, a `scope`, the `invariant` under test, and a `pass criterion` that CI can
evaluate deterministically.

The `id` column is the canonical key used by CI and test tooling. Do not
rename an existing `id`; add new rows with new ids.

| ID | Scope | Invariant | Pass criterion |
|----|-------|-----------|----------------|
| `route.native-ok` | routes | A strong native query leaves Recova hidden. | Route is `NATIVE_OK` and no Decision Cards are produced. |
| `route.zero-results` | routes | A zero-result query activates recovery. | Route is `RECOVER` with a non-null strategy. |
| `route.constraint-violating-native` | routes | A native result that violates a hard constraint is rejected. | Route is `RECOVER` (or `CLARIFY`) and the offending candidate appears in `rejectedCandidates` with `HARD_CONSTRAINT_VIOLATION`. |
| `route.ambiguous-intent` | routes | Ambiguous intent triggers clarification. | Route is `CLARIFY` with a non-null `refinementPrompt`. |
| `route.no-valid-candidate` | routes | No valid candidate triggers clarification/exit, not padding. | Route is `CLARIFY` (or `RECOVER` with `NO_VALID_RECOVERY`) and `cards` is empty. |
| `hard-constraint.enforcement` | hard-constraint enforcement | Every Decision Card satisfies all hard constraints. | For every card, every `kind` in `constraints` with `hardness === "hard"` is present in `card.satisfied` and absent from `card.relaxedSoft`. |
| `hard-constraint.no-relaxation` | hard-constraint enforcement | Soft relaxation never changes a hard constraint. | No hard constraint kind appears in any card's `relaxedSoft`. |
| `soft-relaxation.explicit` | hard-constraint enforcement | Soft relaxation is explicit and disclosed. | Any relaxed soft constraint appears in `relaxedSoft` and is reflected in the card `reason`. |
| `cards.max-3` | max 3 cards | At most three Decision Cards are rendered. | `cards.length <= 3` (enforced by the solver, W04 — see note below). |
| `cards.no-bestseller-padding` | no bestseller padding | No random bestseller padding. | Every card is grounded in a catalog/adapter result; no card is added solely to fill space. |
| `cards.unknown-stays-unknown` | unknown stays unknown | Unknown evidence is shown as unknown. | A constraint kind with no evidence appears in `card.unknown`, never in `satisfied` or `relaxedSoft`. |
| `ids.no-llm-invention` | LLM cannot invent IDs | LLM output cannot create product/variant IDs absent from adapter results. | Every `productId`/`variantId` in `cards` and `rejectedCandidates` exists in the adapter result set for the session. |
| `extract.synonyms` | constraint extraction | English synonyms/normalization map to canonical terms. | Extracted constraint equals the expected normalized `{kind, value, hardness}` from the benchmark fixture. |
| `extract.price` | constraint extraction | Price ceilings ("under $120", "up to R$300") parse as `price_max`. | Same as above with `kind: "price_max"`. |
| `extract.size` | constraint extraction | Sizes (numeric or letter) parse as `size`. | Same as above with `kind: "size"`. |
| `extract.color` | constraint extraction | Named colors parse as `color` when catalog-supported. | Same as above with `kind: "color"`; unsupported colors land in `unknown`. |
| `extract.compatibility` | constraint extraction | "compatible with X" parses as `compatibility`. | Same as above with `kind: "compatibility"`. |
| `extract.intended-use` | constraint extraction | Intended use ("for running", "for a wedding") parses as `intended_use`. | Same as above with `kind: "intended_use"`. |
| `merchant.fail-safe` | merchant config | Merchant configuration fails safely. | Invalid or missing `MerchantConfig` is rejected at the boundary; no secret-bearing connector config is accepted from client input. |

## Notes

- **`cards.max-3`** is a domain invariant enforced by the solver (W04), not by
  the `RecoveryDecision` schema. The schema deliberately does not cap
  `cards.length` so a solver bug is observable in tests rather than silently
  masked at the boundary.
- **`ids.no-llm-invention`** is enforced by the deterministic tools/adapters,
  which are authoritative over product/variant existence. The LLM may only
  select from IDs already returned by those tools.
- **`merchant.fail-safe`** maps to the `MerchantConfig` skeleton in §3.8:
  `storeId`, catalog/commerce adapters, branding, enabled strategies, repair
  permissions, model/tool limits, attribution settings, and feature flags are
  all server-controlled.
