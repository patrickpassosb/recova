# Recova V2 Hackathon Build Plan

## Summary

Upgrade Recova for the Google All Things Agentic Hackathon without discarding the existing work. Preserve the current Deco version as `deco-v1-final`, reuse its storefront, Shopify/cart integration, lexical search, branding, and tests, and replace only the backend pieces that cannot support the required Google stack or a future startup.

The hackathon product will center on one promise: **Recova understands failed shopper intent, presents up to three grounded Decision Cards, blocks misleading alternatives, and converts a recovered search into checkout and attributed revenue.**

The build will be startup-ready only through clean tenant/configuration seams. Billing, plan management, usage enforcement, merchant onboarding, and additional platforms remain explicitly post-hackathon.

## Product and scope decisions

### Build now

- English-only submission, application UI, documentation, demo, and video.
- Shopify D2C brands as the initial ICP.
- Activation on:
  1. zero native results; or
  2. native results that fail explicit shopper constraints.
- Decision-first interface integrated into search, not a generic chat popup.
- Real Shopify catalog data, cart mutation, and checkout URL.
- Gemini 2.5+ through Vertex AI, Google ADK TypeScript, Cloud Run, Firestore, Pub/Sub, Secret Manager, and OpenTelemetry.
- Minimal merchant proof showing activation reason, extracted constraints, blocked unsafe products, checkout value, and attributed recovered revenue.
- Signed, idempotent order-attribution pipeline with an honestly labeled simulated payment trigger because Shopify admin/webhook access is unavailable.

### Preserve for later

- Tag the current `main` head as `deco-v1-final` and retain its documentation/history.
- Develop on `feat/recova-v2-hackathon-19-08-2026`.
- Move the old MCP backend under `legacy/deco-mcp-app/` only after V2 reaches parity; keep its tests runnable during the transition.
- The future Free tier will run on V2 rather than maintaining V1 as a second production service.

### Explicitly defer

- Stripe/billing, pricing enforcement, plan-selection UI, and merchant self-service.
- Full analytics dashboard, trends, cohorts, A/B testing, alerts, and exports.
- VTEX/Nuvemshop/Tray integrations.
- Search-repair background agent, unlimited reengagement, and broad “FULL search” behavior.
- Claims of real paid revenue or a FARM Rio partnership.

## Simplified recovery behavior

Replace the contradictory `SILENT / ASSISTED / FULL` opportunity score with three deterministic outcomes:

- `NATIVE_OK`: at least one top native result satisfies every hard constraint and has sufficient lexical/category coverage. Recova stays hidden.
- `RECOVER`: native search is empty or all relevant native results violate a hard constraint, and safe catalog alternatives exist. Recova displays Decision Cards.
- `CLARIFY`: intent is ambiguous or no candidate safely satisfies all hard constraints. Recova asks one targeted question and never pads results with unrelated bestsellers.

The LLM may extract and normalize intent, but it may not invent products, variants, prices, availability, or evidence. A deterministic solver selects and ranks only catalog-returned variants.

## Shopper experience

1. The storefront performs its normal search and passes the query plus top native results to Recova server-side.
2. Recova extracts structured constraints such as category, maximum price, size, color, compatibility, and intended use.
3. The catalog adapter retrieves real products and sellable variants, including selected options and availability when exposed by Shopify.
4. Hard constraints filter candidates; soft preferences rank remaining candidates.
5. The UI renders at most three Decision Cards, each showing:
   - real image, title, selected variant, price, and availability;
   - why it matches;
   - satisfied hard constraints;
   - partial/unknown evidence without overclaiming;
   - `Add to cart` and `Buy now` actions when the commerce adapter supports them.
6. Refinement chips or text update the same session and cards.
7. `Add to cart` uses the existing real Shopify cart mutation; `Buy now` opens the real checkout URL.
8. A protected demo action emits a signed Shopify-shaped paid-order payload. The real webhook verification, Pub/Sub event, Firestore transaction, deduplication, and attribution logic process it.
9. The merchant proof labels the result: **“Real checkout; simulated payment trigger; real attribution pipeline.”**

## Public interfaces and core types

Expose a stable HTTP boundary around ADK:

- `POST /v1/recovery/evaluate`
  - Input: authenticated/fixed demo tenant, query, optional session ID, and normalized native result evidence.
  - Output: `RecoveryDecision`.
- `POST /v1/recovery/refine`
  - Input: session ID plus chip/text response.
  - Output: updated `RecoveryDecision`.
- `POST /v1/webhooks/shopify/orders-paid`
  - Verifies the raw-body Shopify HMAC before publishing.
- `POST /v1/demo/order-paid`
  - Requires `DEMO_ORDER_PAID_SECRET`, loads the recorded session/checkout context, creates a signed synthetic order, and calls the shared production handler. Disable outside the demo environment.
- `GET /v1/demo/metrics`
  - Returns only the four minimal merchant-proof metrics.
- `GET /healthz` and `GET /diagnostics`
  - Never expose secrets or tokens.

Core contracts:

```ts
type RecoveryRoute = "NATIVE_OK" | "RECOVER" | "CLARIFY";

type ConstraintKind =
  | "category"
  | "price_max"
  | "size"
  | "color"
  | "compatibility"
  | "intended_use";

interface ShopperConstraint {
  kind: ConstraintKind;
  value: string | number;
  hardness: "hard" | "soft";
  sourceText: string;
}

interface DecisionCard {
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
  unknown: ConstraintKind[];
  reason: string;
  rank: number;
}

interface RecoveryDecision {
  sessionId: string;
  route: RecoveryRoute;
  activationReasons: string[];
  constraints: ShopperConstraint[];
  cards: DecisionCard[];
  blockedUnsafe: Array<{ productId: string; reasons: string[] }>;
  refinementPrompt: string | null;
  refinementOptions: string[];
}
```

Use Zod at every HTTP, ADK tool, Firestore, webhook, and UI boundary.

## Architecture

### Repository layout

- `agent-service/`: Node/TypeScript Google ADK service and Cloud Run entrypoint.
  - `domain/`: constraints, routing, deterministic safety solver, Decision Card builder.
  - `adapters/`: Shopify catalog/commerce, Firestore, Pub/Sub, Vertex/Gemini.
  - `agents/`: thin ADK intent/refinement agent definitions and grounded tools.
  - `http/`: recovery, webhook, demo, health, and diagnostics routes.
  - `workers/`: Pub/Sub order-attribution consumer.
- `demo-storefront/`: evolve the existing TanStack storefront and cart integration.
- `legacy/deco-mcp-app/`: preserved V1 backend after parity.
- `deploy/`: Cloud Run service/worker configuration, Pub/Sub, Firestore indexes/TTL, and documented deployment commands.
- `workflows/recova-hackathon-build.js`: tracked dynamic workflow used to coordinate implementation and review.
- `docs/`: `SPIN_UP.md`, `TECH_STACK.md`, `UX_SPEC.md`, `DEMO.md`, `ATTRIBUTION.md`, and `ROADMAP.md`.

### Startup-ready seams only

Define `MerchantConfig` with server-controlled `storeId`, catalog/commerce adapter selection, branding, feature flags, and future limits. The hackathon has one allowlisted demo tenant with all demo capabilities enabled. Do not build billing or expose arbitrary store URLs from client input.

Sessions, events, and attribution documents are scoped under `storeId`. Use Firestore transactions for concurrent updates and a transactional create-if-absent key based on `storeId + orderId + exposedSessionId`.

### Google/GCP behavior

- `STUB_GEMINI=true` supplies deterministic structured fixtures for local tests and recording fallback.
- The submitted hosted path uses Vertex/Gemini; stub mode is never presented as the compliant deployment.
- Keep the ADK agent thin: Gemini extracts/normalizes intent and writes explanations; deterministic tools retrieve products and enforce constraints.
- Deploy the request service and attribution worker to Cloud Run.
- Store secrets in Secret Manager; use ADC/service accounts rather than committed credentials.
- Publish verified order events to Pub/Sub and persist sessions/events/attributions in Firestore.
- Instrument route, latency, model/tool calls, unsafe blocks, checkout, and attribution with OpenTelemetry.

## FARM public-catalog showcase

Treat FARM as optional P1 after every core acceptance check passes by the Day-9 checkpoint.

- Implement a read-only public-Shopify catalog adapter for `farmrio.com/products.json` only through a server-side domain allowlist.
- Cache responses, rate-limit requests, sanitize HTML, impose strict timeouts, and retain a timestamped snapshot fallback.
- Label the experience as public-catalog compatibility testing with no partnership/customer claim.
- FARM cards use `View product`; they never call FARM cart/order endpoints and never contribute to recovered-revenue metrics.
- In production roadmap, public catalog ingestion becomes a zero-credential preview only; authorized Shopify app installation remains the real connector.
- If the core is not fully green by Day 9, omit this implementation and keep it in `ROADMAP.md`.

## Dynamic-workflow execution

All implementation milestones are coordinated by one bounded, resumable pi dynamic workflow; Recova’s shipped runtime remains Google ADK.

The workflow will:

1. **Inspect and lock architecture**
   - Parallel product, ADK/GCP, security, and UX reviews with stable work IDs.
   - Whole-ledger synthesis that reports missing/failed coverage.
   - Foreground human checkpoint before implementation.
2. **Implement sequential milestones**
   - One persistent implementer thread handles foundation, domain/agent, persistence/attribution, storefront, and deployment to avoid merge conflicts.
   - Fresh parallel reviewers examine correctness, security, tests, UX/accessibility, and hackathon claims after each milestone.
   - Reviewer findings return to the implementer thread for bounded revision.
3. **Verify**
   - Run code review and adversarial verification against the full diff.
   - Preserve null/failed reviewer identities rather than treating missing coverage as approval.
4. **Deploy checkpoint**
   - Human confirmation before creating/updating cloud resources.
5. **Demo and claims checkpoint**
   - Separate technical, product, and skeptical judges verify that every visible claim is demonstrated and honestly labeled.

Workflow requirements: literal metadata/phases, unique labels, JSON schemas for consumed outputs, finite fan-out/concurrency/retries, no guessed model names, no default token cap unless explicitly supplied, `log()` rather than `console`, and foreground execution for checkpoints.

## Test and acceptance matrix

### Unit

- Constraint extraction and normalization for English queries, synonyms, prices, sizes, colors, and unsupported attributes.
- Route matrix for native-good, zero-results, unsafe-native, ambiguous, and no-safe-candidate cases.
- Every returned card satisfies all hard constraints.
- Unsafe category substitutions such as sneaker → flip-flop are blocked when intended use/category makes them unsafe.
- Unknown evidence is shown as unknown, never converted into a positive claim.
- No random bestseller padding and maximum three cards.
- LLM output cannot introduce product or variant IDs absent from adapter results.
- Merchant scoping and feature configuration default safely.

### Integration

- Shopify adapter parses products, variants, selected options, images, price, and availability from real supported fields.
- Firestore emulator: two concurrent refinements do not lose session updates.
- Valid HMAC succeeds; invalid/missing HMAC is rejected before Pub/Sub.
- Duplicate order payload creates one attribution only.
- Attribution amount comes from the signed/shared order context, not an arbitrary browser event.
- Pub/Sub retry remains idempotent.
- Demo order endpoint rejects missing/invalid secret and is disabled outside demo mode.

### Storefront/E2E

1. Good native query leaves Recova hidden.
2. Zero-results query opens integrated Decision Cards, supports refinement, adds a real variant to cart, and opens real Shopify checkout.
3. Unsafe native results are visibly blocked and replaced only by safe alternatives.
4. No safe alternative produces one clarification question and preserves native results.
5. Simulated paid trigger updates the minimal merchant proof exactly once with the disclosure visible.
6. Keyboard navigation, focus behavior, `aria-live`, touch targets, reduced motion, mobile bottom-sheet/integrated layout, and desktop panel pass accessibility checks.
7. All visible strings are English.

### Performance and reliability

- Deterministic activation decision: warm p50 target below 50 ms.
- Full Gemini-assisted recovery: warm p50 target below 2 seconds; report measured values rather than claiming the target if missed.
- Cold start is measured separately and documented.
- Catalog/model failures preserve native search and show a recoverable error; they never leave the shopper with a worse result.
- Stub and emulator paths allow local development without cloud quota, while one real Vertex/GCP E2E is mandatory before submission.

### Verification commands

- `agent-service`: install, format check, typecheck, lint, unit/integration tests, production build, and Docker build.
- `demo-storefront`: `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run build`.
- Legacy backend until archived: `bun run ci:check`, `bun run check`, `bun test`, and `bun run build`.
- Playwright E2E against local emulators/stub and the hosted deployment.
- Secret scan and final public-repo clone/spin-up test.

Exact `agent-service` script names will be standardized in its `package.json` so CI invokes `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.

## Delivery sequence

1. **Day 1:** preserve V1/tag/branch; audit GCP credit, Vertex access, service accounts, and current Shopify variant data; scaffold ADK Hello World and documentation skeleton.
2. **Days 2–3:** lock schemas; port catalog/search primitives; implement constraints, explicit routing, safety solver, and unit tests.
3. **Day 4:** ADK intent/refinement flow, stub mode, grounded tools, and Decision Card builder.
4. **Day 5:** Firestore sessions/events and tenant-safe configuration.
5. **Day 6:** HMAC webhook, Pub/Sub worker, idempotent attribution, and protected demo trigger.
6. **Days 7–8:** English Decision Card UI, real cart/checkout, minimal merchant proof, accessibility, responsive behavior, and E2E tests.
7. **Day 9 checkpoint:** deploy Cloud Run, run real Vertex E2E, benchmark, and decide FARM P1 strictly from the all-green core gate.
8. **Day 10:** hosted smoke tests, third-party spin-up test, security/adversarial review, docs freeze.
9. **Day 11:** record one English happy-path video, show technical proof and honest attribution label, publish repo, and submit.
10. **Day 12:** emergency buffer only; no new features.

## Demo narrative

- Shopper searches with a real category/price/variant constraint supported by the current demo catalog.
- Native search fails or returns an unsafe category substitute.
- Recova extracts the intent and presents three evidence-backed Decision Cards.
- One unsafe recommendation is visibly blocked.
- Shopper refines once, adds the selected real variant, and opens real Shopify checkout.
- The signed simulated payment trigger flows through Pub/Sub and idempotent attribution.
- Minimal merchant proof shows recovered value with the disclosure.
- Close with the startup wedge: one layer added to existing Shopify search, with Free/Paid packaging and broader analytics clearly marked as roadmap.

## Assumptions and defaults

- The supplied V2 document is a roadmap source, not an immutable implementation contract.
- GCP credits are pending; local work proceeds with stub/emulators, but lack of real Vertex/Cloud Run access before submission is a blocking compliance risk that must be escalated at the deployment checkpoint.
- Shopify admin access is unavailable, so no claim of receiving a real Shopify paid-order webhook will be made.
- The existing Shopify demo remains the only purchase/checkout source.
- The core scenario uses only constraints actually exposed by that catalog; no demo-only product attributes are fabricated.
- FARM is optional, read-only, non-affiliated, and excluded from conversion claims.
- Architecture seams are implemented now; commercial tiers are documented but not built.
- No mainnet/blockchain deployment is involved.
