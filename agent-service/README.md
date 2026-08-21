# agent-service

Recova's recovery agent service. Node 24 + TypeScript, ESM, strict.

## Requirements

- Node.js >= 24
- npm >= 11

## Install

```sh
npm install
```

## Scripts

| Script              | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Run with watch reload (`tsx watch`)            |
| `npm run build`     | Compile TypeScript to `dist/`                  |
| `npm run typecheck` | Type-check without emitting (`tsc --noEmit`)   |
| `npm test`          | Run smoke tests (`node:test` via `tsx`)        |
| `npm start`         | Run the compiled entrypoint (`node dist/index.js`) |

## Run

```sh
npm run dev
# or, after a build:
npm run build && npm start
```

The server listens on `PORT` (default `8080`).

## Endpoints

- `GET /healthz` — liveness probe, returns `200 {"status":"ok"}`
- `GET /readyz` — readiness probe, returns `200 {"status":"ready"}`

## Docker

```sh
docker build -t agent-service .
docker run --rm -p 8080:8080 agent-service
```

The image is multi-stage, runs as a non-root `node` user, and honors `PORT`.

## Notes

- Only `zod` is a runtime dependency for now. Gemini/ADK wiring lands in a
  later work item (W05); do not add those deps here yet.
- `.env` is gitignored — copy `.env.example` to `.env` and fill in values.
  Never commit secrets.
