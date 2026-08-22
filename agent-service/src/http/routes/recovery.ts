import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { ShopperAgent } from "../../agents/shopper.js";
import { getMerchant } from "../../config/merchants.js";
import { InMemorySessionStore } from "../../config/sessions.js";
import { RecoveryDecisionSchema } from "../../domain/schemas.js";

/**
 * Recovery HTTP routes (docs/PLAN_FINAL.md §7).
 *
 *   - `POST /v1/recovery/evaluate`  { storeId, query, nativeResultIds? }
 *   - `POST /v1/recovery/refine`    { sessionId, userResponse }
 *
 * Both return a Zod-validated `RecoveryDecision`. Commerce (cart/checkout) is
 * intentionally absent here: the agent has no cart/checkout power, and those
 * routes are a separate concern.
 */

const EvaluateRequestSchema = z.object({
  storeId: z.string(),
  query: z.string(),
  nativeResultIds: z.array(z.string()).optional(),
});

const RefineRequestSchema = z.object({
  sessionId: z.string(),
  userResponse: z.string(),
});

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Read and JSON-parse a request body, rejecting malformed input. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("invalid JSON body");
  }
}

export type RecoveryHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<boolean>;

/**
 * Create the recovery route handler. Returns `true` when the request was
 * handled (including error responses); `false` when the path is not a recovery
 * route (so the caller can fall through to 404).
 */
export function createRecoveryHandler(): RecoveryHandler {
  const sessionStore = new InMemorySessionStore();
  const agents = new Map<string, ShopperAgent>();

  function agentFor(storeId: string): ShopperAgent | null {
    const merchant = getMerchant(storeId);
    if (!merchant || !merchant.active) return null;
    let agent = agents.get(storeId);
    if (!agent) {
      agent = new ShopperAgent(merchant.catalogAdapter, {}, sessionStore);
      agents.set(storeId, agent);
    }
    return agent;
  }

  return async (req, res) => {
    const { method, url } = req;
    const path = url?.split("?")[0] ?? "/";

    if (method === "POST" && path === "/v1/recovery/evaluate") {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch {
        sendJson(res, 400, { error: "invalid JSON body" });
        return true;
      }
      const parsed = EvaluateRequestSchema.safeParse(body);
      if (!parsed.success) {
        sendJson(res, 400, { error: "invalid request", details: parsed.error.issues });
        return true;
      }
      const { storeId, query, nativeResultIds } = parsed.data;

      const merchant = getMerchant(storeId);
      if (!merchant) {
        sendJson(res, 404, { error: `unknown storeId: ${storeId}` });
        return true;
      }
      if (!merchant.active) {
        sendJson(res, 503, { error: `merchant ${storeId} is deactivated` });
        return true;
      }

      const agent = agentFor(storeId)!;
      const sessionId = randomUUID();
      const decision = await agent.evaluate({
        query,
        nativeResultIds: nativeResultIds ?? [],
        sessionId,
      });
      sessionStore.set({
        sessionId,
        storeId,
        query,
        nativeResultIds: nativeResultIds ?? [],
        decision,
      });
      sendJson(res, 200, RecoveryDecisionSchema.parse(decision));
      return true;
    }

    if (method === "POST" && path === "/v1/recovery/refine") {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch {
        sendJson(res, 400, { error: "invalid JSON body" });
        return true;
      }
      const parsed = RefineRequestSchema.safeParse(body);
      if (!parsed.success) {
        sendJson(res, 400, { error: "invalid request", details: parsed.error.issues });
        return true;
      }
      const { sessionId, userResponse } = parsed.data;

      const session = sessionStore.get(sessionId);
      if (!session) {
        sendJson(res, 404, { error: `unknown sessionId: ${sessionId}` });
        return true;
      }

      const merchant = getMerchant(session.storeId);
      if (!merchant || !merchant.active) {
        sendJson(res, 404, { error: `merchant ${session.storeId} unavailable` });
        return true;
      }

      const agent = agentFor(session.storeId)!;
      const decision = await agent.refine(session, userResponse);
      sessionStore.set({ ...session, decision });
      sendJson(res, 200, RecoveryDecisionSchema.parse(decision));
      return true;
    }

    return false;
  };
}
