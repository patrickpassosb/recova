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

## Daily spend

| Day | Workflow tokens | Cost | Notes |
|---|---|---|---|
| D1 (2026-08-20) | 1.6M | $0.99 | 9 agents, W00/W02/W03 complete |
