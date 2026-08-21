import { createServer, type Server, type ServerResponse } from "node:http";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * Minimal HTTP app exposing liveness/readiness probes.
 *
 * Uses only the Node `http` module for now; the ADK/domain wiring lands in
 * later work items (W03+). `GET /healthz` reports process liveness and
 * `GET /readyz` reports readiness to serve traffic.
 */
export function createApp(): Server {
  return createServer((req, res) => {
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

    sendJson(res, 404, { error: "not found" });
  });
}
