# PREEXISTING_WORK — Hackathon Eligibility Disclosure

**Project:** Recova V2 — Google All Things Agentic Hackathon (Taskmaster)
**Rule covered:** the submitted project must be newly created during the submission period;
incorporated pre-existing work must be disclosed.

## Boundary

- **Tag `deco-v1-final`** marks ALL work completed before the All Things Agentic submission
  period — the end state of Recova V1, built for the **Deco "Agents for Commerce" hackathon**
  (built 2026-08-06 → 2026-08-09 by Patrick Passos + Gabriel Sacilotto, with agent assistance).
- **Everything after `deco-v1-final` is hackathon-period V2 work.**

## Pre-existing components (present at tag `deco-v1-final`)

| Component | Path | What it is | V2 disposition |
|---|---|---|---|
| MCP agent app | `mcp-app/` | Bun server with tools `search_recovery`, `converse`, `reengage`, `analyze_zero_results`, `track_event`, `dashboard`, `hello` (DeepSeek V4 Flash via Ollama Cloud) | **Superseded** — V2 runtime is Node+TS ADK on Gemini 3.7 Flash; logic ported as reference, runtime replaced |
| MCP web UI | `mcp-app/web/` | React + shadcn/ui frontend with a page per MCP tool (`search-recovery`, `converse`, `reengage`, `analyze-zero-results`, `dashboard`, `hello`) incl. dashboard UI | **Superseded** — V2 merchant console replaces this UI |
| LLM client lib | `mcp-app/api/lib/llm.ts` | DeepSeek V4 Flash via Ollama Cloud (OpenAI-compatible), env-driven fallback chain | **Superseded** — V2 uses Gemini 3.7 Flash via ADK |
| MCP resources & prompts | `mcp-app/api/resources/`, `mcp-app/api/prompts/` | MCP resources (`appResource`, `hello`, `searchRecovery`) + prompt templates | **Superseded** — V2 ADK replaces MCP resource/prompt plumbing |
| Storefront deploy/dev infra | `demo-storefront/deploy/` (ArgoCD), `wrangler.jsonc`, `Dockerfile`, `.devcontainer/` | Deco storefront deployment + dev-container setup | **Evolved** — V2 deploys to Cloud Run |
| VPS provisioning script | `setup_vps.sh` | VPS setup for the V1 agent (Bun, Tailscale proxy) | **Superseded** — V2 uses Cloud Run |
| V1 CI workflows | `mcp-app/.github/workflows/ci.yml`, `publish-registry.yml` | CI + registry publish for the MCP app | **Superseded** — V2 CI/CD contract |
| Agent configs & skills | `mcp-app/AGENTS.md`, `mcp-app/CLAUDE.md`, `demo-storefront/AGENTS.md`, `mcp-app/.claude/skills/` | Agent-assistance configs and skills used to build V1 | Kept for provenance |
| Lexical search lib | `mcp-app/api/lib/shopify.ts` | `lexicalSearch`, `SYNONYMS`, `normalize`, `deriveCatalogCategories`, `extractMaxPrice` (tested) | **Ported** into `agent-service` deterministic layer during the hackathon |
| Session store (in-memory) | `mcp-app/api/lib/sessions.ts` | Map-based sessions, 30 min TTL | **Replaced** — Firestore-backed, merchant-scoped |
| Event store (local JSON) | `mcp-app/api/lib/events.ts` | append-only `data/events.json` | **Replaced** — event schema + Firestore/Pub-Sub |
| Storefront | `demo-storefront/` | TanStack Start + Deco storefront wired to Shopify store `gimenesdevstore` | **Evolved during hackathon** — moved behind Catalog/Commerce adapter interfaces, stress-test catalog added |
| Recovery overlay UX | `demo-storefront/src/components/search/SearchRecoveryOverlay.tsx` + `recovaTheme.ts` | Inline overlay, carousel, refinement chips, white-label theme system | **Evolved during hackathon** — becomes Decision Cards over the V2 domain |
| Tests | `mcp-app/api/**/*.test.ts`, `demo-storefront/**/__tests__/*` | V1 unit/component tests | Kept where relevant; V2 adds new suites |
| Branding assets | `demo-storefront/public/recova/*.svg`; brand book (external vault) | Recova name, logos, colors `#155EEF/#102A43/#F97316/#16A34A`, Manrope/Inter | Reused as brand assets |
| V1 docs | `README.md`, `BRIEF.md`, `GOAL.md`, `docs/PRD.md`, `docs/FLUXOGRAMA.md`, `docs/search-recovery-fluxograma.excalidraw` | Deco-hackathon specs (Portuguese) | Superseded by English V2 docs; kept for provenance |

## Built during the All Things Agentic submission period (V2)

Auditable via `git log deco-v1-final..HEAD`. Status markers: **[built]** — present in the tree, **[planned]** — not yet built; entries move to [built] only when the artifact lands.

- **[built]** V2 foundation: eligibility tag, this disclosure, CI fast gate (`.github/workflows/ci.yml`), docs set
- **[built]** `agent-service/` scaffold — Node + TypeScript service shell (`/healthz`, `/readyz`, Dockerfile); ADK agent integration is Day-3 work
- **[built]** Domain contract schemas (`agent-service/src/domain/schemas.ts`) + acceptance/benchmark/catalog-import design docs
- **[planned]** Google ADK shopper agent on Gemini 3.7 Flash + Gemma 4 31B enrichment routing
- **[planned]** Deterministic recovery domain: constraints, routes (`NATIVE_OK/RECOVER/CLARIFY`), strategies, Decision Cards
- **[planned]** ~10k-product stress-test catalog (Apache-2.0 Shopify product-catalogue dataset) + deterministic importer + recovery benchmark fixtures
- **[planned]** Merchant console, background search-repair agent, attribution pipeline, Firestore state, Cloud Run deployment

## Third-party data / models

- Shopify product-catalogue dataset (HuggingFace), Apache-2.0 — used for the stress-test catalog.
- Fashion/ecommerce images inside that dataset remain subject to the dataset's license terms.
- Gemini 3.7 Flash and Gemma 4 31B accessed via Google's Gemini Developer API under Google ToS.
- No FARM Rio partnership, customer, or endorsement is claimed anywhere in this project.
