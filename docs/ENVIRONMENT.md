# ENVIRONMENT — W00 Audit (Day 1)

**Date:** 2026-08-20 (W00-ENV audit)
**Repo:** recova (V2, pre-credit development mode)

## Tool versions

| Tool | Version | Status | Notes |
|------|---------|--------|-------|
| node | v24.18.0 | ✅ ready | Modern LTS line; fine for Vite/TS toolchain |
| npm | 11.16.0 | ✅ ready | Ships with node; registry reachable |
| docker | 29.7.2 (build a7dcaa6) | ✅ ready | Daemon assumed available (version reports OK) |
| docker compose | v5.5.0 | ✅ ready | Compose v2 plugin present |
| gcloud | 581.0.0 (alpha 2026.08.14, beta 2026.08.14, bq 2.1.37) | ⚠️ partial | SDK installed; **no project configured** (`gcloud config get-value project` → `(unset)`); account `patrickpassosb@gmail.com` active |
| bun | 1.3.14 | ✅ ready | Optional runtime; not required by plan |
| git | 2.55.0 | ✅ ready | Tag `deco-v1-final` present (77a2d1d) |

## Registry / network

| Check | Result | Status |
|-------|--------|--------|
| npm registry | `npm ping` → PONG 259ms; `npm view zod version` → 4.4.3 | ✅ reachable |

## Firebase emulators

| Check | Result | Status |
|-------|--------|--------|
| gcloud emulators | Cloud Firestore / Datastore / PubSub / Spanner / Bigtable emulators listed as **Not Installed** | ⚠️ missing |
| firebase CLI | `firebase: command not found` (exit 127) | ❌ missing |

Firebase emulator suite is **not available** — must be installed (`gcloud components install cloud-firestore-emulator` and/or `npm i -g firebase-tools`) before any local emulator-based work.

## Ports (listening state)

| Port | State |
|------|-------|
| 3001 | free (not listening) |
| 5173 | free (not listening) |
| 8080 | free (not listening) |

No dev servers currently running; no port conflicts for pre-credit development.

## Pre-existing work boundary

| Check | Result | Status |
|-------|--------|--------|
| docs/PREEXISTING_WORK.md | exists (43 lines, hackathon eligibility disclosure) | ✅ present |
| git tag deco-v1-final | present, points to 77a2d1d | ✅ present |

## Summary

- **Ready:** node/npm, docker + compose, gcloud SDK (with active account), bun, git, npm registry, free ports, pre-existing-work disclosure + V1 tag in place.
- **Missing / blocking:**
  1. **gcloud project not set** — `gcloud config get-value project` returns `(unset)`. Needed before any GCP/Firebase deployment or emulator config.
  2. **Firebase emulators not installed** — no firebase CLI, no gcloud emulator components. Blocks local emulator-based development/testing.
- **Blocking for pre-credit dev mode:** only the Firebase emulator gap (and gcloud project selection) — both are install/config steps, not architecture blockers. No existing deployment is assumed; ports are free.
