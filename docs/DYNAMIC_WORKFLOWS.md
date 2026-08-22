# Dynamic Workflows — Metrics & Lessons

Recova V2 is built with dynamic workflows: bounded implementation slices, independent
adversarial review, objective gates. This file is the running ledger. Per plan §8.5
we capture: workflow/work-item type, agents, wall-clock, model/token cost, first-pass
acceptance, reviewer findings, fix iterations, tests added/broken, human interventions,
diff size, escaped defects.

## Model routing (active)

| Tier | Model | Used for | Note |
|---|---|---|---|
| small | `ollama-cloud/deepseek-v4-flash:max` | audits, exploration, cheap passes | flash always max, per cost-benefit |
| medium | `ollama-cloud/deepseek-v4-pro:cloud` (medium thinking) | implementation slices, fixers | bulk workhorse |
| big | `openai-codex/gpt-5.6-sol` (medium thinking) | adversarial reviews, adjudication | highest-quality, cross-model |
| vision | `ollama-cloud/kimi-k3` / `kimi-k2.7-code` (image input declared in models.json) | visual QA | harness probe needs `/reload` to pick up the config |

No token budgets — free spend with full accounting. Structural bounds only: `maxAgents 30`, `concurrency 4`, `agentRetries 1`. Quota-wall pauses are free (journaled resume replays completed prefix).

## Run log

### D1 — recova-v2-day1-foundation (2026-08-20)

- **Scope:** W00 compliance lock, W02 CI skeleton + agent-service scaffold, W03 domain contracts + benchmark design.
- **Agents:** 9 (3 parallel W00 probes, 1 adjudicator, impl+review+fix for W02, impl+review for W03).
- **Wall-clock:** 549s (~9 min). **Tokens:** 1.6M total, 149.5K cached. **Cost:** $0.99.
- **Human direct work alongside:** tag `deco-v1-final` pushed, tier configs, `.env` + gitignore, live Gemini API verification (`gemini-3.7-flash`, `gemma-4-31b-it` confirmed on Developer API), foundation commit `cf881de`.

| Work item | Agent tier | Result | Findings |
|---|---|---|---|
| W00-ENV | small | complete | wrote docs/ENVIRONMENT.md (date error fixed by orchestrator) |
| W00-PRE | small | complete | expanded PREEXISTING_WORK.md with 7 missing disclosures |
| W00-VISION | exact kimi-k3 | **no-vision** | harness stripped image → config patch in models.json |
| W00-ADJ | big | **amber** | 7 gaps (ADK/Cloud Run not yet evidence, no gcloud project, emulator tooling missing, disclosure wording) |
| W02-IMPL | medium | complete | ci.yml + agent-service scaffold (6 tests, typecheck green) |
| W02-REV | big | **fail** | 1 high (CI would be red on V1's biome/prettier violations), 1 medium |
| W02-FIX | medium | complete | partial — V1 fixes needed ownership override (orchestrator did) |
| W03-IMPL | medium | complete | schemas.ts + tests, ACCEPTANCE/BENCHMARK/CATALOG_IMPORT docs |
| W03-REV | big | **fail** | 1 high (benchmark format couldn't encode 6 matrix rows), 1 medium (missing extraction rows) |

- **First-pass acceptance:** 2/5 work items passed review cleanly (W00 probes). Both reviewed implementations needed fixes — **reviewers are earning their keep; this is the system working**.
- **Orchestrator fixes after run:** V1 biome unused-imports + array-index-key, prettier 4 files, llm.ts lazy env resolution, stub dummy-key, live-LLM test gated behind `RUN_LLM_LIVE=1` (was network-flaky), ENVIRONMENT.md date, PREEXISTING_WORK wording, benchmark format gap closure, matrix extraction rows.
- **Escaped defects caught:** V1 CI was silently red (biome/prettier/test flake) — would have poisoned every future gate.
- **Tests after D1:** agent-service 6 pass, mcp-app 97 pass + 3 skip (0 fail), demo-storefront 66 pass + prettier green + typecheck green.
- **Lesson 1:** vision capability is harness-config, not model reality — declare `input:["text","image"]` in models.json or `read` strips images.
- **Lesson 2:** V1 "tests pass" claims from the earlier hackathon were only true with a live LLM key; network-gated tests must be opt-in (`RUN_LLM_LIVE=1`).

### D2 — recova-v2-day2-domain-catalog (2026-08-21)

- **Scope:** W04 recovery domain, W06 catalog importer, W06 adapter seam.
- **Agents:** 9 (impl+review+fix per phase; W04 implementer hit the 40-min timeout on attempt 1 but wrote all files — reviewer validated on disk; ledger recorded the timeout as failed, code was real and reviewed).
- **Tokens:** 6.52M (4x D1 — big-model reviewers read full domain code; flash-vacuum optimization not yet applied to reviewer prompts).
- **Reviews:** all 3 phases FAILED first pass, all fixed by fixers:
  - W04: regex `while(exec)` infinity loop without `g` flag (test suite timeout), hard-constraint bypass via same-kind soft constraint (the real security-class bug the plan exists to prevent).
  - W06-catalog: signed image URLs broke byte-determinism; dev fixture was 100% apparel (500/500, no diversity).
  - W06-adapter: forbidden token string literal in an error message.
- **Orchestrator verify after run:** 92 tests pass bare exit 0, tsc exit 0, fixture histogram confirms 40% apparel + diverse rest, forbidden-token grep clean (remaining hits are config field names, not secrets). mcp-app + demo-storefront untouched and green.
- **Lesson 3:** first-pass fail rate 60% across 2 days — reviewers with write-revert-revert failing-test power catch semantic bugs compile-test loops miss. Keep.
- **Lesson 4:** implementer reports can be lost on timeout while their writes persist; orchestrator must verify disk state as the source of truth before recording failure.

### D3 — recova-v2-day3-vertical-slice (2026-08-22) — PROTECTED BASELINE LANDED

- **Scope:** W05 ADK+Gemini agent/routes/config/evals, W09 storefront Decision Cards, service-level Day-3 gate.
- **Agents:** 6/6 complete, 0 errors. **Tokens:** 12.36M (largest day; medium implementers at 60-min budgets).
- **Reviews:** W05 PASS first try (compliance: real ADK instantiation, stub network isolation probed and reverted, no key leakage). W09 FAIL→fixed: gateway accepted unvalidated JSON (high), stale decisions between queries, color-claim leak through selectedOptions (all fixed + regression tests).
- **D3-GATE: PASS with evidence in docs/DAY3_E2E.md** — zero-results query -> RECOVER (QUERY_REPAIR, 1 card, hard size M) -> refine `under $250` -> 2 cards honoring price+size -> cart -> checkout URL; every ID verified against fixture.
- **Lesson 5:** the fix prompt must state the max-3/card-contract fields precisely; UX review caught semantic drift between card contract and component copy (color badges). Copy rules now encoded in DecisionCards tests.

## Daily spend

| Day | Workflow tokens | Cost | Notes |
|---|---|---|---|
| D1 (2026-08-20) | 1.6M | $0.99 | 9 agents, W00/W02/W03 complete |
| D2 (2026-08-21) | 6.5M | ~$2.50 est | W04 domain + W06 catalog/adapters, 9 agents, 3x fail-then-fix reviews |
| D3 (2026-08-22) | 12.4M | ~$5 est | W05 ADK agent pass-first-review, W09 UX fail-then-fix, D3 gate PASS |
