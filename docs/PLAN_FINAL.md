# Recova V2 — Agentic Commerce Recovery Build Plan

**Revision date:** 2026-08-20  
**Hackathon:** Google All Things Agentic Hackathon  
**Primary category:** Taskmaster  
**Submission deadline:** August 31, 2026 at 5:00 PM PDT

## 1. Objective

Build Recova V2 as a production-minded autonomous commerce recovery system without discarding the useful pre-existing Recova work.

The hackathon product centers on one promise:

> **When ordinary ecommerce search fails, Recova understands what the shopper is actually trying to buy, verifies real catalog inventory against the shopper's constraints, rejects misleading alternatives, and takes the shopper from failed search to cart and checkout.**

Recova V2 is not a generic shopping chatbot. It is an intervention and optimization layer around existing commerce search.

The build has two simultaneous goals:

1. Ship a strong, reproducible All Things Agentic Hackathon submission.
2. Test a high-throughput engineering methodology based on bounded dynamic workflows, separate adversarial review contexts, objective work queues, and continuously enforced release gates.

The second goal must accelerate the first. If workflow machinery becomes the bottleneck, simplify the workflow rather than weakening product correctness.

---

## 2. Hackathon compliance contract

The submission must satisfy the current official requirements:

- Use **Gemini 3.7 Flash (`gemini-3.7-flash`)** as Recova's default production model through the Gemini API or Vertex AI. Do not silently downgrade to an older model; any temporary fallback used for development must be explicit.
- Use at least one Google Agent Framework; Recova uses Google ADK TypeScript.
- Use at least one Google Cloud infrastructure service. Recova will use **Cloud Run for the submitted agent/backend path**. Firestore, Pub/Sub, Secret Manager, or other GCP services are used only where they are the best fit rather than for checklist inflation.
- Support English and submit all required materials in English.
- Provide repository access, reproducible spin-up instructions, an architecture diagram, and a demo video of no more than four minutes.
- The video must visibly prove execution on at least one Google Cloud infrastructure service.
- The submitted project must be newly created during the submission period. Any incorporated pre-existing Recova code must be explicitly disclosed.
- Any third-party API, catalog, SDK, data, or branding must be used only when authorized and consistent with its terms.

### Pre-existing work boundary

Do not present pre-hackathon Recova work as newly built.

- Preserve the current Recova state in the original repository with tag `deco-v1-final`.
- Create the V2 hackathon project/repository during the submission period.
- Add `PREEXISTING_WORK.md` identifying every reused component, including storefront code, Shopify/cart integration, lexical search, branding assets, tests, or other inherited pieces.
- Keep a clear commit/history boundary showing what was created during the hackathon.
- The submitted V2 agentic architecture, agent workflows, recovery domain, persistence, analytics, repair agent, deployment, and new UX must be demonstrably hackathon-period work.

No FARM Rio partnership, customer, paid-revenue, or other third-party endorsement claim will be made.

---

## 3. Product scope

### 3.1 Shopper recovery — core product

Recova activates when native search fails to satisfy shopper intent.

Top-level routes remain deterministic and simple:

- `NATIVE_OK`: at least one strong native result satisfies every hard constraint. Recova stays hidden.
- `RECOVER`: native search is empty or materially violates shopper constraints and valid catalog alternatives exist.
- `CLARIFY`: shopper intent is materially ambiguous or no candidate can be safely selected without more information.

The LLM may interpret and normalize intent, choose tools, decide whether more evidence is needed, and write explanations. It may not invent products, variants, prices, availability, catalog evidence, or merchant facts.

A deterministic domain layer remains the authority over catalog truth and hard-constraint enforcement.

### 3.2 Recovery strategies

`RECOVER` is the route; a strategy describes how recovery occurs.

Initial strategies:

- `EXACT_ALTERNATIVE`: another catalog result satisfies all hard constraints.
- `VARIANT_RECOVERY`: correct product exists but the useful size/color/variant must be selected explicitly.
- `SOFT_PREFERENCE_RELAXATION`: all hard constraints are preserved while one or more soft preferences are relaxed and disclosed.
- `QUERY_REPAIR`: native search wording or normalization failed, but the catalog contains the requested item.
- `BUNDLE_RECOVERY`: the shopper's goal can only be satisfied by a small combination of products and the bundle is explicitly explained.
- `NO_VALID_RECOVERY`: no valid candidate exists; Recova clarifies or exits instead of padding results.

Cross-category substitutions are allowed only when the shopper's intended use remains satisfied and the reason is explicit. A superficially related product is never treated as valid merely to avoid returning no result.

### 3.3 Decision Cards

Render at most three grounded Decision Cards. Each contains:

- real image when available;
- title;
- product and variant identity;
- selected options;
- price;
- availability;
- why it matches;
- hard constraints satisfied;
- soft preferences satisfied or relaxed;
- unknown evidence shown as unknown;
- `Add to cart` and `Buy now` when supported.

No random bestseller padding.


### 3.4 Large-scale fashion catalog and recovery stress-test environment

The catalog is part of Recova's product-quality oracle, not decorative seed data.

Recova must be stress-tested against a **large, realistic fashion catalog** so retrieval, ranking, clarification, and recovery behavior are meaningful at scale.

#### Catalog target

- **~10,000 fashion/apparel/footwear products** for the main stress-test environment;
- real product images and useful product text sourced from a legally reusable public dataset or catalog;
- tens of thousands of variants where the source data supports them;
- enough overlap in size, color, price, style, intended use, availability, and category to create non-trivial ranking decisions;
- deliberately difficult cases: out-of-stock variants, near-matches, missing attributes, ambiguous intent, wrong-category distractors, and products that satisfy soft preferences while violating a hard constraint.

#### Do not generate 10,000 products with LLM calls

The catalog must be created **programmatically**, not by asking Gemini/Gemma to invent every product.

Preferred pipeline:

`licensed/public product dataset → deterministic normalization/import script → Recova Catalog schema → storefront/search index`

Use existing product images, titles, descriptions, brands, and categories from the selected dataset. Missing operational fields such as stock states, SKUs, synthetic prices, or adversarial fixture mutations may be generated deterministically from a fixed seed.

LLMs may enrich or classify only where useful; they are not the primary catalog generator.

#### Storefront integration

The 10k catalog must be visible in the actual Recova demo storefront.

The storefront must depend on stable interfaces rather than Shopify directly:

- `CatalogAdapter`
- `CommerceAdapter`
- `OrderAdapter`
- optional `SearchAdapter`

The hackathon storefront may use a **Recova stress-test catalog adapter** as its primary catalog source.

Because there is no Shopify Admin access and no existing deployment is assumed, the system must not require those 10,000 products to exist inside Shopify.

If an existing Shopify-backed integration remains useful, keep it as a separate adapter/integration path rather than the system of record for the 10k catalog.

#### Recovery benchmark

Maintain a curated `recovery-benchmark` dataset containing:

- shopper query;
- expected route;
- expected hard/soft constraints;
- acceptable products/variants;
- forbidden candidates;
- expected clarification behavior;
- expected recovery strategy.

CI evaluates retrieval/ranking changes against this benchmark.

The objective is not merely catalog size. The objective is to prove that Recova remains correct and useful when thousands of plausible alternatives exist.

### 3.5 Animated shopper assistant / avatar layer

Gabrielly's avatar concept is retained as a product/brand enhancement, but it must remain **presentation-only**: the avatar never owns reasoning, catalog truth, or workflow state.

Desired behavior:

- one distinctive Recova character/avatar;
- subtle idle movement and blinking;
- expressions mapped to meaningful states such as thinking, clarification, successful recovery, no-valid-match, and checkout;
- animation should reinforce state changes rather than distract from Decision Cards;
- reduced-motion support;
- mobile performance budget;
- graceful fallback to static artwork when animation fails.

**Bible Strong Avatar Lab evaluation:** it is a strong technical fit because it supports procedural 2D avatars, expressions, reusable animations, blinking, SVG/PNG output, and React/JavaScript exports. However, the project/runtime is AGPL-3.0. Directly incorporating its runtime/packages requires an explicit license decision before implementation.

License gate:

1. determine whether the Recova hackathon/startup code will intentionally comply with AGPL obligations; or
2. obtain separate permission/licensing from the project author; or
3. use only assets/exports whose rights are clearly compatible; or
4. implement an independent Recova avatar/animation layer without incorporating AGPL code.

Until the licensing gate is resolved, W09 may prototype the visual concept, but the release baseline must not depend on Bible Strong Avatar Lab code.


### 3.6 Merchant analytics dashboard

Build a useful merchant-facing V1 dashboard rather than only four demo counters.

Minimum useful analytics:

- searches evaluated;
- Recova activation rate;
- `NATIVE_OK / RECOVER / CLARIFY` distribution;
- zero-result and constraint-failure trends;
- top failed queries;
- top extracted constraints;
- rejected candidate reasons;
- recovery strategy distribution;
- products frequently requested but unavailable;
- cart value influenced by Recova;
- checkout value initiated by Recova;
- attributed paid revenue only when supported by a verified paid-order event;
- background repair findings and repair status.

Simulated payment events must never be mixed with real paid revenue. Demo metrics must label simulation distinctly.

### 3.7 Background search-repair agent

Build an asynchronous merchant-side agent that learns from failed sessions.

The repair agent may:

1. read failed/clarified recovery sessions;
2. cluster recurring failure patterns;
3. inspect the merchant catalog through bounded read-only tools;
4. distinguish inventory gaps from search/index/query-understanding problems;
5. propose a repair;
6. validate the proposed repair against historical examples;
7. apply only reversible, merchant-scoped repair rules that are explicitly allowed by configuration;
8. log every action and measured before/after result.

Initial repair types:

- synonym normalization;
- query rewrite rules;
- facet/attribute normalization;
- category mapping corrections;
- search boost/demotion configuration;
- merchant-visible catalog-gap recommendations.

The repair agent does not silently modify Shopify catalog data or merchant inventory.

### 3.8 Multi-merchant architecture

Multi-tenancy is architectural P0 even when the hackathon has one primary demo merchant.

Define server-controlled `MerchantConfig` with:

- `storeId`;
- catalog adapter;
- commerce adapter;
- branding;
- enabled recovery strategies;
- repair permissions;
- model/tool limits;
- attribution settings;
- feature flags;
- future plan/usage limits.

All sessions, events, repairs, analytics, and attribution records are scoped by `storeId`.

Client input may never select arbitrary stores or secret-bearing connector configuration.

### 3.9 Multiple commerce platforms

The domain must not depend directly on Shopify.

Define stable interfaces for:

- `CatalogAdapter`;
- `CommerceAdapter`;
- `OrderAdapter`;
- optional `SearchAdapter`.

Hackathon delivery target:

- Shopify: full working implementation.
- Other platforms: interface, contract tests, and implementation-ready seams.
- A second real platform implementation is attempted only if authorized credentials/data and the core release gate are green; it must not endanger the submission.

Do not use unauthorized public merchant catalogs merely to create platform breadth.

### 3.10 Merchant onboarding

Design onboarding as a product surface, but keep credentials server-controlled.

V1 onboarding flow:

1. create merchant configuration;
2. connect/validate authorized commerce credentials;
3. inspect catalog compatibility;
4. run a diagnostic recovery test;
5. preview Recova behavior;
6. activate features and repair permissions;
7. expose health/diagnostics without secrets.

For the hackathon, one allowlisted demo merchant may be provisioned administratively if full OAuth/app-install access is unavailable. The architecture must still support generalized onboarding later.

---

## 4. Core contracts

```ts
type RecoveryRoute = "NATIVE_OK" | "RECOVER" | "CLARIFY";

type RecoveryStrategy =
  | "EXACT_ALTERNATIVE"
  | "VARIANT_RECOVERY"
  | "SOFT_PREFERENCE_RELAXATION"
  | "QUERY_REPAIR"
  | "BUNDLE_RECOVERY"
  | "NO_VALID_RECOVERY";

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

interface RejectedCandidate {
  productId: string;
  variantId?: string;
  reasons: string[];
  classification:
    | "HARD_CONSTRAINT_VIOLATION"
    | "UNAVAILABLE"
    | "INSUFFICIENT_EVIDENCE"
    | "POLICY_BLOCK";
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
  relaxedSoft: ConstraintKind[];
  unknown: ConstraintKind[];
  reason: string;
  rank: number;
}

interface RecoveryDecision {
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
```

Use Zod at every HTTP, ADK tool, Firestore, Pub/Sub, webhook, workflow-output, and UI boundary.

---

## 5. Agent architecture

### 5.1 ADK shopper agent

The ADK agent is not merely a JSON extractor. It orchestrates the recovery workflow while deterministic tools remain authoritative over facts.

Bounded tools should include equivalents of:

- `inspect_native_results`;
- `extract_or_normalize_constraints`;
- `search_catalog`;
- `inspect_variants`;
- `validate_candidates`;
- `request_clarification`;
- `prepare_decision_cards`;
- `add_to_cart`;
- `create_checkout`;
- `record_recovery_event`.

Agent responsibilities:

- interpret shopper goal;
- decide what evidence/tools are needed;
- ask at most one targeted clarification at a time;
- choose an allowed recovery strategy;
- generate grounded explanations from deterministic tool outputs;
- stop when the goal cannot be safely completed.

Domain responsibilities:

- product/variant existence;
- hard-constraint validation;
- availability and pricing truth;
- candidate ranking invariants;
- tenant isolation;
- permissions;
- event and attribution integrity.

### 5.2 Background repair agent

Run separately from the shopper request path.

It operates over aggregated merchant-scoped evidence, not individual prompt memory.

It may use tools for:

- failed-session retrieval;
- clustering/summarization;
- catalog inspection;
- historical replay;
- repair proposal validation;
- bounded repair configuration writes;
- repair result measurement.

Every write is reversible, scoped, auditable, and controlled by merchant feature flags.

---

## 6. Runtime architecture

### Repository layout

- `agent-service/`
  - `domain/`: constraints, routing, recovery strategies, deterministic solver, Decision Cards.
  - `adapters/`: Shopify, future commerce adapters, Firestore, Pub/Sub, Vertex/Gemini.
  - `agents/`: shopper recovery agent and background repair agent.
  - `http/`: recovery, refinement, webhook, analytics, onboarding/demo, health, diagnostics.
  - `workers/`: attribution and background repair consumers/jobs.
  - `analytics/`: event aggregation and merchant metrics.
  - `config/`: merchant configuration and feature flags.
- `demo-storefront/`: open-source storefront application, integrated recovery UX, cart and checkout-like flows through adapter interfaces.
  - `avatar/`: optional presentation-only character state/animation integration behind a feature flag; never coupled to recovery correctness.
- `merchant-console/`: analytics, failure insights, repair evidence, configuration/diagnostics.
- `legacy/` or original V1 repository reference: preserved pre-hackathon work only where needed.
- `deploy/`: Cloud Run, Pub/Sub, Firestore indexes/TTL, IAM, deployment scripts.
- `workflows/`: dynamic workflow definitions, schemas, run logs, workflow metrics.
- `docs/`: architecture, pre-existing-work disclosure, spin-up, security, attribution, demo, roadmap.

### Google Cloud

- **Gemini 3.7 Flash (`gemini-3.7-flash`)** is the default submitted model. Prefer `medium` thinking initially; benchmark `low` for cheap/high-volume classification or extraction paths only when evals show no meaningful quality regression.
- Google ADK TypeScript for agent orchestration.
- **Cloud Run is the required Google Cloud deployment target for the submitted agent/backend path and provides the visible Google Cloud proof.**
- Use Firestore only if it is the best fit for sessions/events/repair state; otherwise keep the persistence interface portable.
- Use Pub/Sub only where asynchronous event delivery materially simplifies the system.
- Use Secret Manager only for secrets that actually live in GCP.
- ADC/service accounts with least privilege for all Google-hosted components.
- The storefront may remain on Cloudflare Workers or another more suitable platform; do not migrate it to GCP merely for architectural purity.
- OpenTelemetry-compatible tracing/metrics for model calls, tool calls, route decisions, failures, repairs, checkout, and attribution.

### Model routing policy

Recova uses **model routing by task value and required quality**.

Primary model:

- **Gemini 3.7 Flash (`gemini-3.7-flash`)** for shopper-facing orchestration, ambiguous reasoning, high-stakes decisions, complex recovery logic, and tasks where quality materially affects user trust.

Background/cheap model:

- **Gemma 4 31B (`google/gemma-4-31b-it`) through a hosted API**, not self-hosted;
- use it for high-volume/background work that does not require the strongest reasoning.

Initial Gemma-eligible tasks:

- multimodal catalog enrichment from product image + title + description;
- attribute extraction/classification;
- category/style/material normalization;
- batch metadata cleanup;
- low-risk failure clustering/summarization;
- other repetitive enrichment tasks that pass evals.

Routing rule:

`Gemma-eligible task → run Gemma 4 31B → validate against task-specific quality threshold → escalate to Gemini 3.7 Flash if confidence/quality is insufficient or the task is high-stakes`

Do not route shopper-critical decisions to the weaker model merely to save cost.

All inferred catalog attributes must retain provenance and confidence and must not silently become merchant ground truth.

This Gemma integration also serves the hackathon's optional bonus-model integration requirement.

### Local determinism

- `STUB_GEMINI=true` provides deterministic structured fixtures for local tests.
- Firestore/Pub/Sub emulators support local integration tests.
- Stub mode is never presented as the compliant hosted deployment.
- At least one real Vertex + ADK + Cloud Run end-to-end test is mandatory before submission.

---


### Pre-credit / low-cost development mode

Lack of Google Cloud credits must not block most engineering work.

Before credits arrive:

- use `gemini-3.7-flash` through the **Gemini Developer API / Google AI Studio free tier** for interactive development and representative model evals where available;
- use `STUB_GEMINI=true` for deterministic CI and high-volume local tests;
- run the ADK service locally in Docker;
- use Firestore/Pub/Sub emulators only for the GCP components we actually choose to keep;
- run merchant analytics and background-repair workflows entirely against local fixtures/emulators;
- use the robust seeded catalog/recovery benchmark locally;
- build production containers locally and verify them before cloud deployment;
- keep real-model evaluation sets bounded and cached so dynamic workflows do not repeatedly burn tokens.

When a billing-enabled Google Cloud project is available, keep costs near zero by:

- Cloud Run scale-to-zero / no minimum instances;
- using the free Cloud Run allowance for low hackathon traffic where applicable;
- staying inside Firestore's free daily quota when practical;
- staying inside Pub/Sub's free monthly throughput for the demo;
- keeping Secret Manager within its small free allowance where possible;
- enforcing budget alerts and conservative quotas before enabling autonomous workflow calls.

Do not make every CI run invoke Gemini or deploy to Google Cloud. Split CI into deterministic local/emulator gates and a smaller real-model/hosted release gate.

At least one real Google-hosted agent/cloud E2E remains mandatory before submission.

---

## 7. Public interfaces

Stable HTTP boundary around ADK and domain services:

- `POST /v1/recovery/evaluate`
- `POST /v1/recovery/refine`
- `POST /v1/recovery/cart`
- `POST /v1/recovery/checkout`
- `POST /v1/webhooks/shopify/orders-paid`
- `POST /v1/demo/order-paid` — protected, demo-only, clearly simulated.
- `GET /v1/analytics/summary`
- `GET /v1/analytics/search-failures`
- `GET /v1/analytics/recoveries`
- `GET /v1/repairs`
- `POST /v1/repairs/:id/apply` — only for allowed reversible repair types.
- `GET /v1/merchant/diagnostics`
- `GET /healthz`
- `GET /readyz`

Endpoints never expose access tokens, HMAC secrets, service-account material, or internal model prompts.

---

## 8. Dynamic-workflow engineering system

Dynamic workflows are a first-class part of this build, not an incidental helper.

The methodology is inspired by the Bun Rust rewrite pattern:

> work queue → implement → independent adversarial review → fix → objective verification → commit → repeat

The purpose is not to maximize agent count. The optimization target is:

> **correct, useful, reviewed output per wall-clock hour while keeping the release baseline green.**


### 8.1 Execution semantics: dynamic workflow vs goal loop

A dynamic workflow is **not one endless `/goal` loop**.

Each workflow is a bounded state machine with explicit phases, work queues, exit conditions, retry limits, and escalation points. The control workflow can launch or resume specialized workflows when dependencies become green.

Default lifecycle:

`PLAN → ORACLE/TESTS → IMPLEMENT → VERIFY → ADVERSARIAL REVIEW → FIX → FULL GATE → COMPLETE`

A specialized workflow may internally loop over `IMPLEMENT → VERIFY → REVIEW → FIX`, but only while:

- unresolved owned work remains;
- retry/iteration limits are not exceeded;
- dependencies remain valid;
- the protected baseline is not being degraded.

Human input is required only at explicit checkpoints or escalation conditions, for example:

- architecture or product ambiguity that tests cannot resolve;
- authorization/credential decisions;
- license/compliance decisions;
- destructive or production-impacting actions;
- repeated failure after bounded retries;
- final production/submission approval.

Therefore the desired operating model is **autonomous-by-default phase execution**: agents should complete well-specified phases, launch dependent workflows, review, fix, test, and resume without asking for routine approval. Human intervention is reserved for the explicit critical-service/compliance/production checkpoints defined in this plan. The control workflow maintains state so a run can be resumed rather than restarted.

This differs from a generic goal loop:

- a goal loop repeatedly asks "is the overall goal done?";
- a dynamic workflow knows **which phase and work item it owns**, what constitutes proof, who reviews it, and what happens after failure;
- many dynamic workflows can operate concurrently under one dependency graph;
- completion is based on objective gates, not the model declaring itself finished.

### 8.2 Core workflow invariant


No implementation workflow begins without an oracle unless it is explicitly an exploration/research workflow.

For new product behavior, manufacture the oracle first:

1. requirement;
2. invariants;
3. positive examples;
4. negative/adversarial examples;
5. acceptance/eval tests;
6. only then implementation workflow.

Agents are never allowed to weaken or delete tests merely to reach green.

### 8.3 Workflow topology

Use one control/orchestration workflow plus specialized bounded workflows.

#### W00 — Eligibility and architecture lock

Work queue:

- hackathon compliance gaps;
- architecture contradictions;
- pre-existing-work boundary;
- unknown external dependencies;
- confirm there is **no existing deployment assumed** and no production domain is treated as authoritative until created by this project.

Exit:

- architecture contract accepted;
- compliance checklist green;
- unresolved blockers explicitly logged.

#### W01 — Baseline preservation and migration

Work queue:

- tag/reproduce V1;
- identify reusable pieces;
- inspect current storefront code/configuration without assuming any existing live deployment;
- document pre-existing work;
- move/import only what V2 needs.

Exit:

- V1 remains reproducible;
- V2 owns its new code cleanly;
- disclosure is complete.

#### W02 — CI foundation

Work queue:

- missing scripts;
- inconsistent environments;
- flaky baseline checks;
- Docker build and staging skeleton.

Exit:

- baseline CI contract exists and is green.

#### W03 — Domain contracts, recovery benchmark, and oracles

Work queue:

- schemas;
- route matrix;
- recovery strategies;
- constraint invariants;
- deterministic importer/normalizer for a ~10,000-product fashion stress-test catalog;
- product-image/data provenance and license record;
- benchmark query matrix with allowed/forbidden products and expected routes;
- adversarial examples.

Exit:

- contract and domain tests define expected behavior before large implementation fan-out.

#### W04 — Recovery domain

Work queue:

- constraint normalization;
- candidate filtering;
- ranking;
- rejection reasons;
- Decision Card construction.

Exit:

- full domain matrix green;
- no hard-constraint violations escape.

#### W05 — ADK shopper orchestration

Work queue:

- tool contracts;
- Gemini structured outputs;
- agent decision/eval failures;
- clarification behavior;
- grounded explanation behavior;
- model-routing policy between Gemini 3.7 Flash and Gemma 4 31B.

Exit:

- agent eval suite green in stub mode and representative real-model runs pass.

#### W05B — Gemma catalog enrichment and cheap-task routing

Work queue:

- multimodal catalog enrichment;
- attribute/category/style/material extraction;
- provenance/confidence storage;
- Gemma-vs-Gemini eval cases;
- escalation thresholds;
- cost/quality measurement.

Exit:

- Gemma 4 31B improves catalog usefulness on the selected enrichment tasks;
- task-specific eval thresholds are green;
- low-confidence/high-stakes cases escalate to Gemini 3.7 Flash;
- no inferred attribute is treated as unqualified merchant truth.

#### W06 — Catalog/commerce adapters and storefront actions

Work queue:

- 10k stress-test catalog adapter;
- variants/options;
- availability;
- storefront product browsing/PDP;
- demo cart/checkout-like flow for the stress-test catalog;
- preserve/verify Shopify adapter only where it remains useful;
- adapter contract failures.

Exit:

- stress-test catalog adapter contract suite and real storefront E2E green;
- any Shopify integration retained by the project passes its own contract tests.

#### W07 — Persistence and tenant isolation

Work queue:

- sessions;
- events;
- merchant config;
- concurrent refinement;
- tenant leakage attempts.

Exit:

- emulator integration and isolation tests green.

#### W08 — Attribution pipeline

Work queue:

- Shopify HMAC;
- Pub/Sub delivery;
- idempotency;
- order/session matching;
- retry behavior;
- demo event isolation.

Exit:

- duplicate/retry/security matrix green.

#### W09 — Shopper UX and animated assistant

Work queue:

- integrated search activation;
- Decision Cards;
- refinement;
- cart/checkout;
- mobile/desktop behavior;
- error states;
- accessibility;
- animated Recova avatar state mapping behind a feature flag;
- reduced-motion/static fallback;
- Bible Strong Avatar Lab licensing spike before any AGPL runtime integration.

Exit:

- Playwright shopper scenarios green.

#### W10 — Merchant analytics

Work queue:

- event schema;
- aggregation correctness;
- dashboard metrics;
- filtering;
- simulation disclosure.

Exit:

- every displayed metric traces to validated events;
- analytics acceptance suite green.

#### W11 — Background repair agent

Work queue:

- failure clustering;
- catalog-gap diagnosis;
- repair proposal generation;
- historical replay;
- bounded repair application;
- before/after measurement.

Exit:

- repair eval suite green;
- no unauthorized catalog mutations;
- reversible repair demo works end to end.

#### W12 — Merchant onboarding and configuration

Work queue:

- merchant config bootstrap;
- connector diagnostics;
- feature flags;
- activation checks;
- permissions.

Exit:

- second merchant configuration can be created safely without domain code changes, even if only the demo merchant is connected to a live commerce account.

#### W13 — Platform abstraction

Work queue:

- Shopify leakage into domain code;
- adapter contracts;
- contract-test harness;
- second adapter only if authorized and time permits.

Exit:

- domain tests pass with fake adapter;
- Shopify is an implementation detail, not a domain dependency.

#### W14 — Security and abuse

Work queue:

- prompt injection;
- tool poisoning;
- tenant isolation;
- auth bypass;
- webhook forgery;
- secret exposure;
- arbitrary URL/store access;
- unsafe repair writes.

Exit:

- no unresolved critical/high findings;
- remaining findings documented with explicit risk acceptance.

#### W15 — Performance and observability

Work queue:

- cold/warm latency;
- model/tool latency;
- unnecessary LLM calls;
- trace gaps;
- retry storms;
- catalog timeout behavior.

Exit:

- measured performance documented;
- traces explain a full shopper recovery and a repair run.

#### W16 — Deployment and release

Work queue:

- Docker failures;
- IAM;
- Cloud Run configuration for the Google-hosted backend/agent path;
- GitHub Actions deployment workflow;
- optional non-GCP storefront deployment configuration;
- migrations/indexes where applicable;
- staging smoke failures;
- rollback path.

Exit:

- immutable artifact deployed to staging;
- hosted E2E green;
- release candidate reproducible.

#### W17 — Full adversarial review

Work queue:

- complete diff;
- architecture mismatches;
- security gaps;
- false product claims;
- skipped/weak tests;
- dead code;
- hidden failure modes.

Exit:

- two or more independent review contexts complete;
- critical/high findings fixed;
- missing reviewer coverage is treated as missing, not approval.

#### W18 — Demo and submission verification

Work queue:

- every spoken/visible claim;
- architecture diagram;
- setup instructions;
- Cloud proof;
- 4-minute narrative;
- pre-existing-work disclosure;
- judge test path.

Exit:

- every claim is reproducible from the repository or live demo;
- final submission checklist green.

### 8.4 Inner workflow pattern

Default bounded unit:

1. select one work item with stable ID;
2. give implementer only the context required;
3. implement;
4. run local targeted oracle;
5. send diff/output to two independent adversarial reviewers;
6. reviewers assume the change is wrong and search for failure modes;
7. fixer applies validated feedback;
8. rerun oracle;
9. commit only the owned files/work item;
10. record workflow metrics.

Rules:

- reviewers do not implement their own reviewed change;
- implementers do not self-approve;
- no test deletion or expectation weakening without explicit architecture-level approval;
- no `git reset --hard`, blind stash/pop, or cross-worktree destructive operations;
- shared schemas/contracts have explicit ownership and serialize dependent changes;
- parallelism is bounded by subsystem ownership, machine resources, API limits, and merge risk;
- use unique workflow/work-item IDs and machine-readable result schemas;
- finite retries; repeated failure escalates to the control workflow/human checkpoint;
- missing/failed reviewer outputs are recorded, never interpreted as approval;
- fix the workflow when a recurring class of agent error appears instead of hand-fixing each instance.

### 8.5 Workflow experiment metrics

For every workflow capture:

- workflow/work-item type;
- agents spawned;
- wall-clock time;
- model/token cost when available;
- first-pass acceptance rate;
- number/severity of reviewer findings;
- fix iterations;
- tests added;
- tests broken;
- human interventions;
- final diff size;
- escaped defects discovered later.

After the hackathon, write a short engineering retrospective answering where dynamic workflows accelerated delivery and where they produced coordination or quality costs.

---

## 9. CI/CD release contract

### Canonical CI/CD platform

**GitHub Actions is the canonical CI/CD system.**

All release gates, staging deployments, release-candidate verification, and production promotion workflows originate from GitHub Actions.

Use ephemeral/short-lived cloud credentials where possible (for example Workload Identity Federation for Google Cloud) rather than storing long-lived service-account keys.

### Principle

> **A green `main` means the commit is a releasable candidate, not merely that it compiled.**

Green cannot prove properties that are not encoded. Therefore the CI contract must cover product invariants, agent behavior, integration behavior, security, deployment, and hosted execution.

### 9.1 Fast PR gate

Required on every change:

- deterministic dependency install with lockfile;
- format check;
- TypeScript typecheck;
- lint;
- unit tests;
- domain invariant tests;
- stubbed agent evals;
- adapter contract tests using fixtures/fakes;
- secret scan;
- production build.

### 9.2 Integration gate

Required before merge when affected:

- Firestore emulator integration tests;
- Pub/Sub/emulated worker tests;
- webhook HMAC/idempotency tests;
- tenant-isolation tests;
- analytics aggregation tests;
- background-repair eval tests;
- Playwright local E2E;
- accessibility automation.

### 9.3 Release-candidate gate

Required for release candidate:

- production Docker image build;
- dependency/vulnerability scan;
- deploy exact immutable image to staging Cloud Run;
- hosted `/healthz` and `/readyz`;
- hosted smoke tests;
- hosted shopper recovery E2E;
- hosted cart/checkout E2E where safe;
- one real Gemini 3.7 Flash + ADK + Google-hosted model path (Gemini Developer API or Vertex AI, according to the final deployment configuration);
- Firestore persistence verification;
- trace/observability verification;
- rollback command/path tested or documented.

### 9.4 Critical-service approval policy

Dynamic workflows are autonomous by default, but they must stop and explain the proposed action before:

- initial creation or deletion of critical cloud resources;
- IAM/service-account/permission changes;
- creation, rotation, or deletion of secrets;
- any action likely to materially increase recurring spend;
- destructive data/schema migrations;
- external writes that can affect real merchant/customer data;
- licensing/compliance decisions;
- production deployment.

After the initial cloud setup is explicitly approved:

- **staging deployments may run autonomously** through GitHub Actions;
- normal staging updates/configuration within the approved architecture may proceed automatically;
- production deployment always requires explicit human approval.

The approval message must state:

1. what will change;
2. why it is necessary;
3. expected cost/risk;
4. rollback path;
5. exact scope of requested authorization.

### 9.5 Production promotion


Promote the exact tested image digest; do not rebuild after staging verification.

During the hackathon, production promotion may require a manual approval checkpoint even when all automated gates are green.

### 9.6 CI integrity rules

- no skipped tests in release gates unless explicitly documented and approved;
- flaky tests are bugs, not permanent retries;
- failing security scans cannot be bypassed silently;
- test fixtures must not contain real secrets;
- test coverage cannot be reduced to make workflows converge;
- hosted deployment proof is part of release readiness.

---

## 10. Test and acceptance matrix

### Domain/unit

- English constraint extraction/normalization for synonyms, price, size, color, compatibility, intended use.
- Route matrix for native-good, zero-results, constraint-violating native results, ambiguous intent, and no-valid-candidate.
- Every Decision Card satisfies all hard constraints.
- Soft relaxation is explicit and never changes a hard constraint.
- Unknown evidence remains unknown.
- Maximum three cards.
- No bestseller padding.
- LLM output cannot create product/variant IDs absent from adapter results.
- Merchant configuration fails safely.


### Recovery benchmark / catalog stress tests

- benchmark runs against the ~10,000-product fashion catalog and includes cross-category distractors;
- multiple candidates intentionally compete on price, size, color, intended use, and availability;
- every benchmark query declares expected route and hard constraints;
- forbidden candidates are explicitly encoded for adversarial cases;
- out-of-stock and unknown-evidence variants cannot be silently upgraded to valid matches;
- retrieval/ranking changes are regression-tested against the benchmark;
- both stubbed and bounded real-Gemini 3.7 runs are evaluated against the same oracle.

### Agent evals

- agent chooses appropriate tools rather than fabricating answers;
- agent clarifies when required;
- agent does not loop indefinitely;
- agent stops when deterministic tools report no valid recovery;
- agent explanations cite only supplied catalog evidence;
- prompt injection inside product text cannot alter system/tool permissions;
- malformed model output is rejected/retried through schemas.

### Integration

- Shopify adapter parses supported products, variants, selected options, images, price, availability.
- concurrent refinements do not lose updates.
- valid HMAC succeeds; invalid/missing HMAC fails before event publication.
- duplicate order event creates one attribution.
- attribution amount comes from verified order context.
- Pub/Sub retry is idempotent.
- demo paid-order endpoint is secret-protected, disabled outside demo, and stored separately from real paid events.
- no cross-merchant session/event/config access.

### Shopper E2E

1. strong native query leaves Recova hidden;
2. zero-result query activates recovery;
3. misleading/constraint-invalid native result is rejected with reason;
4. Decision Cards contain real grounded products;
5. one refinement updates the same session;
6. Add to Cart mutates a real Shopify cart;
7. Buy Now opens real checkout;
8. no valid alternative triggers clarification/exit rather than padding;
9. catalog/model failure preserves native search and provides recoverable failure state;
10. mobile/desktop/keyboard/accessibility behavior passes agreed checks.

### Merchant analytics E2E

- recovery event appears in dashboard;
- metrics match stored source events;
- real and simulated payment states are visually separated;
- search failure trends aggregate deterministically;
- no merchant sees another merchant's metrics.

### Background repair E2E

- repeated failed searches create a repair candidate;
- agent diagnoses failure type using real stored evidence;
- proposed repair is replayed against historical examples;
- allowed reversible repair can be applied;
- before/after outcome is measured;
- unsafe or unauthorized write is blocked;
- merchant can inspect audit trail.

### Performance/reliability

Targets, not fake claims:

- deterministic activation warm p50 target < 50 ms excluding network/catalog dependencies;
- full Gemini-assisted recovery warm p50 target < 2 s when realistic;
- cold start measured separately;
- failure paths preserve native search;
- measured values are reported honestly even when targets are missed.

---

## 11. Demo scenarios

Prepare three shopper scenarios and one merchant-side scenario. When the avatar feature is enabled, its expression/animation should mirror the state transition without taking screen priority from the products or evidence.

### Scenario A — Zero results

A query with explicit category/price/variant constraints returns no useful native result.

Recova:

- interprets constraints;
- searches real catalog;
- returns grounded Decision Cards;
- adds a real variant to cart;
- opens checkout.

### Scenario B — Misleading native result

Native search returns something superficially related but violating a hard intended-use/category constraint.

Recova visibly rejects it and recovers only valid alternatives.

### Scenario C — Clarification

Shopper goal lacks one material decision variable.

Recova asks one targeted question and then completes recovery.

### Scenario D — Background repair

Merchant console shows repeated failed searches.

The repair agent:

- diagnoses a recurring search mismatch;
- proposes a bounded repair;
- validates it against historical sessions;
- applies it in the demo merchant's allowed configuration;
- shows improved replay outcome and audit evidence.

The demo must distinguish clearly between real Shopify checkout and any simulated paid-order trigger.

---

## 12. Delivery strategy: maintain a green vertical slice, then expand

Do not choose between “small MVP” and “build everything at once.”

Use this strategy:

1. make one full shopper recovery vertical slice green very early;
2. freeze it as the minimum shippable baseline;
3. expand product scope aggressively through specialized workflows;
4. every new workflow must preserve previously green release gates;
5. when a feature threatens the submission, stop that workflow rather than destabilizing the baseline.

Feature priority controls sequencing, not long-term product value.

### P0 — release baseline

- hackathon compliance/disclosure;
- Gemini 3.7 Flash + ADK;
- deterministic domain;
- Shopify catalog;
- Decision Cards;
- cart and checkout;
- Firestore session/event state;
- Cloud Run deployment;
- CI foundation.

### P1 — strong product

- analytics dashboard;
- recovery strategy depth;
- merchant evidence;
- background repair agent;
- attribution pipeline;
- strong UX/accessibility;
- animated assistant/avatar layer after its license gate;
- observability.

### P2 — platform/production depth

- generalized onboarding flow;
- multi-merchant operational proof;
- second platform implementation when authorized;
- deeper performance/security hardening;
- additional dashboard analysis.

P1 and P2 are not removed. They are attacked aggressively after the release baseline is protected.

---

## 13. Exact delivery sequence

### Day 1 — Aug 20: contracts, compliance, workflow/CI foundation

- preserve/tag V1 and create V2 project boundary;
- write `PREEXISTING_WORK.md`;
- verify `gemini-3.7-flash` access through Google AI Studio / Gemini Developer API; treat Vertex/Cloud credits as a later release-gate dependency, not a Day-1 blocker;
- scaffold ADK TypeScript and a Cloud Run-compatible container locally;
- configure local Docker + Firestore/Pub/Sub emulators + stub model path;
- define budget alerts, quotas, and zero-min-instance cloud settings before the first billing-enabled deployment;
- lock domain schemas and initial acceptance matrix;
- design the robust recovery-benchmark catalog and seed format;
- implement CI fast gate skeleton;
- build workflow control plane and trial one dynamic workflow on a small bounded task.

**Gate:** architecture/compliance/CI skeleton green; workflow trial reviewed.

### Day 2 — Aug 21: deterministic recovery domain + Shopify adapter

- implement constraints, routes, strategies, solver, rejection reasons;
- Shopify catalog/variant adapter;
- build deterministic importer and load the ~10,000-product fashion catalog into the Recova stress-test catalog service/storefront;
- adapter contract harness;
- domain/property/adversarial tests.

**Gate:** real catalog evidence can produce deterministic valid Decision Cards without Gemini.

### Day 3 — Aug 22: ADK vertical slice + shopper UX

- Gemini 3.7 Flash + ADK orchestration;
- Gemma 4 31B background enrichment + routing evals;
- recovery/refinement HTTP path;
- integrated Decision Cards;
- Add to Cart + checkout;
- prototype avatar state/animation mapping behind a feature flag only if the licensing gate is resolved or using an independent implementation;
- hosted/staging vertical-slice attempt only if a billing-enabled Google Cloud project is available; otherwise complete the same slice locally and preserve hosted deployment for the release gate.

**Gate:** failed query → ADK/tools → grounded cards → real cart → real checkout.

This becomes the protected minimum submission baseline.

### Day 4 — Aug 23: Firestore + event model + multi-tenant isolation

- sessions/events;
- merchant configuration;
- concurrent refinements;
- tenant isolation;
- analytics event schema.

**Gate:** persistence/integration/isolation tests green without breaking Day-3 E2E.

### Day 5 — Aug 24: attribution + asynchronous pipeline

- Shopify HMAC endpoint;
- Pub/Sub worker;
- idempotent attribution;
- protected simulated order path;
- retries/failure handling.

**Gate:** attribution suite green; simulation cannot contaminate real revenue metrics.

### Day 6 — Aug 25: merchant analytics console

- dashboard shell;
- search-failure analysis;
- recovery funnel;
- constraint/rejection analytics;
- recovered cart/checkout value;
- real-vs-simulated attribution separation.

**Gate:** every visible metric has deterministic source-event proof.

### Day 7 — Aug 26: background repair agent

- failure clustering;
- repair diagnosis;
- repair proposal schema;
- historical replay;
- bounded reversible repair application;
- audit log.

**Gate:** one end-to-end repair scenario improves historical replay without unauthorized writes.

### Day 8 — Aug 27: onboarding + platform abstraction + additional recovery depth

- merchant bootstrap/diagnostics flow;
- strengthen adapter boundaries;
- second merchant config test;
- second real platform only if authorized and baseline remains green;
- additional recovery strategy/eval coverage.

**Gate:** no domain coupling to Shopify; multi-merchant contract proven.

### Day 9 — Aug 28: security, observability, performance, deployment hardening

- adversarial security workflow;
- prompt/tool abuse suite;
- OpenTelemetry traces;
- benchmark warm/cold behavior;
- Cloud Run hardening;
- Secret Manager/IAM review;
- staging deploy and hosted E2E.

**Gate:** no unresolved critical/high security findings; hosted release-candidate gate green.

### Day 10 — Aug 29: CI race-to-green + full-system adversarial review

- run complete CI/CD matrix;
- workflow continuously consumes failing tests/checks as work queues;
- two independent whole-diff reviewers;
- third-party spin-up test;
- README, architecture, security, attribution, workflow-retrospective docs.

**Gate:** `main` green under the full release contract.

### Day 11 — Aug 30: demo and submission freeze

- no speculative architecture changes;
- run all four demo scenarios;
- capture visible Google Cloud proof;
- finalize architecture diagram;
- finalize Devpost text;
- record/rehearse ≤4-minute English demo;
- verify repo access and spin-up instructions;
- optional public build post/social bonus only after submission-critical artifacts are complete.

**Gate:** every visible/spoken claim independently verified.

### Day 12 — Aug 31: emergency buffer and submit

- no new features;
- fix only release/submission blockers;
- final hosted smoke test;
- final repository clone/spin-up check;
- final compliance/disclosure check;
- submit before the official deadline.

---

## 14. Kill rules and escalation

Ambition is preserved, but the baseline is protected.

Stop or postpone a workflow when:

- it repeatedly breaks the protected vertical slice;
- required authorization/data for a third-party integration is unavailable;
- the acceptance oracle is too weak to review generated code responsibly;
- workflow coordination overhead exceeds implementation benefit;
- it threatens the submission freeze;
- it depends on a blocked upstream contract and cannot proceed independently.

When a workflow fails repeatedly:

1. inspect failure pattern;
2. improve specification/oracle/workflow instructions;
3. reduce work-item granularity;
4. retry with bounded concurrency;
5. escalate to human architecture decision if still unresolved.

Do not solve systemic workflow errors through repeated manual patches.

---

## 15. Documentation deliverables

Required/recommended docs:

- `README.md` — product, architecture, local/cloud setup, demo credentials if needed.
- `PREEXISTING_WORK.md` — explicit hackathon eligibility disclosure.
- `ARCHITECTURE.md` — runtime, agents, tools, state, event flows, failure handling.
- `TECH_STACK.md` — Gemini 3.7 Flash, ADK, GCP, Shopify, local testing.
- `UX_SPEC.md` — shopper and merchant flows.
- `ATTRIBUTION.md` — real vs simulated order semantics and idempotency.
- `SECURITY.md` — trust boundaries, auth, secrets, prompt/tool threats.
- `CI_CD.md` — exact definition of green/releasable.
- `DYNAMIC_WORKFLOWS.md` — workflow topology, rules, metrics, lessons.
- `DEMO.md` — four-minute narrative and proof checklist.
- `ROADMAP.md` — billing, more platforms, richer onboarding, further autonomous repairs.

---

## 16. Final acceptance contract

The submission is ready only when all of the following are true:

1. A real failed Shopify search can travel through Gemini 3.7 Flash + ADK and return only real catalog-grounded Decision Cards.
2. Deterministic validation prevents hard-constraint-violating or invented products from reaching the shopper.
3. The shopper can refine, add a real variant to cart, and open real checkout.
4. Sessions/events are merchant-scoped and persisted.
5. Merchant analytics accurately explain search failures and recovery outcomes.
6. At least one background repair workflow is demonstrated with bounded, reversible action and audit evidence.
7. Real paid revenue and simulated payment evidence are never conflated.
8. The exact release candidate passes the full CI/CD contract and hosted staging E2E.
9. No unresolved critical/high security issue remains.
10. The repository can be reproduced by a third party from documented instructions.
11. The architecture diagram and four-minute demo visibly prove the Google agent and cloud stack.
12. Pre-existing work is clearly disclosed and the hackathon-period V2 work is auditable.
13. Dynamic-workflow metrics and lessons are captured rather than treated as invisible implementation detail.
14. The ~10,000-product fashion catalog and recovery benchmark are large and adversarial enough that recommendation quality is meaningfully stress-tested rather than demonstrated on trivial inventory.
15. Any avatar implementation is legally compatible with the repository/distribution model, remains presentation-only, and has reduced-motion/static fallback.
16. No submission claim exceeds what can be demonstrated.

---

## 17. Post-hackathon continuation

After submission, keep the same architecture and evolve rather than rewrite:

- merchant self-service onboarding and OAuth/app installation;
- billing, plans, quotas, and usage enforcement;
- production Shopify webhooks across real merchants;
- Nuvemshop, VTEX, Tray, and additional commerce adapters;
- richer merchant analytics/cohorts/experiments/alerts;
- stronger background repair autonomy with approval policies;
- search/index integrations beyond storefront interception;
- continuous workflow-driven maintenance, security review, and repair;
- evaluate the dynamic-workflow experiment quantitatively and keep only the patterns that produced reliable leverage.

The Free/Paid product can run on V2; do not maintain V1 as a permanent second architecture.
