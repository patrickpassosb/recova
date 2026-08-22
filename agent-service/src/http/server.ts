import { createServer, type Server, type ServerResponse } from "node:http";
import { createRecoveryHandler } from "./routes/recovery.js";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * Minimal HTTP app exposing liveness/readiness probes plus the recovery routes
 * (`/v1/recovery/*`). `GET /healthz` reports process liveness and
 * `GET /readyz` reports readiness to serve traffic.
 */
export function createApp(): Server {
  const recovery = createRecoveryHandler();
  return createServer(async (req, res) => {
    const { method, url } = req;
    const path = url?.split("?")[0] ?? "/";

    if (method === "GET" && path === "/healthz") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    if (method === "GET" && path === "/readyz") {
      sendJson(res, 200, { status: "ready" });
      return;
    }

    if (path.startsWith("/v1/recovery/")) {
      const handled = await recovery(req, res);
      if (handled) return;
    }

    sendJson(res, 404, { error: "not found" });
  });
}
