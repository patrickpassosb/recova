# Agent Gateway — ADK Shopper Agent (W05)

This document describes the Recova shopper recovery agent: the ADK
orchestration layer, its bounded tools, the deterministic domain authority,
stub mode, and the model-routing policy.

## 1. Architecture

The agent turns a failed native search into a `RecoveryDecision`
(`NATIVE_OK` / `RECOVER` / `CLARIFY`). It is a Google ADK `LlmAgent` wired with
Gemini 3.7 Flash, plus a deterministic orchestration path that is the
authoritative source of truth for catalog facts and hard-constraint
enforcement.

```
HTTP route layer (src/http/routes/recovery.ts)
        │  POST /v1/recovery/evaluate  { storeId, query, nativeResultIds? }
        │  POST /v1/recovery/refine    { sessionId, userResponse }
        ▼
ShopperAgent (src/agents/shopper.ts)
        │  deterministic orchestration (authoritative)
        │  extract_constraints → search_catalog → route
        │  + ADK LlmAgent (real-model orchestration path)
        ▼
Bounded tools (mapped to deterministic domain functions)
        ├─ inspect_native_results   → CatalogAdapter.getProduct
        ├─ extract_constraints       → domain/constraints.ts
        ├─ search_catalog            → CatalogAdapter.search
        ├─ validate_candidates       → domain/solver.ts
        ├─ prepare_decision_cards    → domain/cards.ts
        └─ refine_session            → session store + re-evaluate
        ▼
Deterministic domain layer (authoritative)
        ├─ domain/constraints.ts  — what the shopper asked for
        ├─ domain/solver.ts       — routing + hard-constraint enforcement
        ├─ domain/cards.ts        — Decision Card construction
        └─ domain/schemas.ts      — Zod contracts at every boundary
```

### Division of responsibility

- **Agent (LLM) responsibilities** — interpret shopper intent, decide which
  tools/evidence are needed, ask at most one targeted clarification, write
  grounded explanations, stop when the goal cannot be safely completed.
- **Domain responsibilities** — product/variant existence, hard-constraint
  validation, availability and pricing truth, candidate ranking invariants,
  tenant isolation, and ID grounding.

The LLM may interpret and write explanations, but it **cannot** invent
products, variants, prices, availability, catalog evidence, or merchant facts.

### Commerce boundary

The agent has **no** cart/checkout tools. `add_to_cart` and `create_checkout`
are deliberately absent from the tool set. Commerce happens only through the
HTTP route layer (a separate concern from this work item); the agent never
receives raw cart/checkout power.

## 2. Bounded tools

Every tool is a Zod-validated contract object mapped to a deterministic domain
function. Tool outputs are the domain's contract objects, never free-form LLM
text.

| Tool | Domain function | Returns |
|------|-----------------|---------|
| `inspect_native_results` | `CatalogAdapter.getProduct` | native products (existing IDs only) |
| `extract_constraints` | `extractConstraints` | `ShopperConstraint[]` |
| `search_catalog` | `CatalogAdapter.search` | grounded `CatalogCandidate[]` |
| `validate_candidates` | `validateCandidates` | `{ valid, rejected }` |
| `prepare_decision_cards` | `buildDecisionCards` | `DecisionCard[]` (≤ 3) |
| `refine_session` | session store + re-evaluate | updated `RecoveryDecision` |

## 3. ID closed universe

**LLM output cannot create product/variant IDs.** The closed-universe assertion
lives in the deterministic domain tools (`assertIdsInUniverse` in
`src/domain/solver.ts`): every `productId`/`variantId` emitted in a
`RecoveryDecision` (cards and rejected candidates) is asserted to exist in the
adapter result universe, and every variant is asserted to belong to its
product. A `DomainInvariantError` is thrown otherwise. The LLM may only select
IDs already returned by the tools.

## 4. Stub mode

`STUB_GEMINI=true` makes the LLM layer (`src/llm/gemini.ts`) return
deterministic canned structured outputs from fixtures, with **no network
calls**. The deterministic orchestration path is LLM-free and therefore
deterministic regardless of stub mode; stub mode additionally guarantees the
LLM clarification prompt is a fixed fixture. Stub mode is for local tests and
CI only — it is never presented as the compliant hosted deployment.

## 5. Model routing policy (placeholder)

The primary model is **Gemini 3.7 Flash (`gemini-3.7-flash`)** for
shopper-facing orchestration and high-stakes decisions.

Background/cheap-model routing to **Gemma 4 31B** (catalog enrichment,
attribute extraction, classification, low-risk clustering) is **Day-8 W05B**
and is not yet implemented. The routing rule will be:

> Gemma-eligible task → run Gemma 4 31B → validate against a task-specific
> quality threshold → escalate to Gemini 3.7 Flash if confidence/quality is
> insufficient or the task is high-stakes.

Shopper-critical decisions are never routed to the weaker model.

## 6. Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `GEMINI_MODEL` | `gemini-3.7-flash` | Model name for the Gemini Developer API. |
| `GEMINI_API_KEY` | *(none)* | Gemini Developer API key (read at runtime, never hardcoded). Required unless `STUB_GEMINI=true`. |
| `STUB_GEMINI` | *(unset)* | When `"true"`, return deterministic canned fixtures with no network. |
| `PORT` | `8080` | HTTP listen port. |

## 7. HTTP routes

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/v1/recovery/evaluate` | `{ storeId, query, nativeResultIds? }` | `RecoveryDecision` |
| `POST` | `/v1/recovery/refine` | `{ sessionId, userResponse }` | `RecoveryDecision` |
| `GET` | `/healthz` | — | `{ status: "ok" }` |
| `GET` | `/readyz` | — | `{ status: "ready" }` |

Unknown `storeId` → `404` (no fallback merchant). Deactivated merchant →
`503`. Unknown `sessionId` → `404`.

## 8. Merchant configuration

Server-controlled registry (`src/config/merchants.ts`):

- `demo` — stress-test catalog adapter (active).
- `demo-shopify` — Shopify adapter shape (deactivated; no credentials).

Client input never selects arbitrary stores or secret-bearing connector
configuration.

## 9. Running the evals

```bash
# Stub-mode eval suite (deterministic, no network) — run by CI.
npm run eval

# Real-model harness (manual only; requires GEMINI_API_KEY).
GEMINI_API_KEY=... npx tsx evals/run-real-model.ts ["<query>"]
```
