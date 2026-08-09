import { describe, it, expect, beforeEach } from "bun:test";
import { stubNetwork, restoreFetchAfterEach } from "./helpers.ts";
import { reengageTool } from "../reengage.ts";
import { searchRecoveryTool } from "../searchRecovery.ts";

/**
 * Integration tests for T3 — reengage (30s timeout, max 2 attempts, no spam).
 */
describe("reengage tool", () => {
  restoreFetchAfterEach();

  const reengage = reengageTool({} as never);
  const search = searchRecoveryTool({} as never);

  type ToolResult = {
    session_id: string;
    products: unknown[];
  };

  async function startSession(query = "tenis"): Promise<string> {
    const res = (await search.execute({
      context: { query },
      runtimeContext: {} as never,
    })) as ToolResult;
    return res.session_id;
  }

  function run(session_id: string) {
    return reengage.execute({
      context: { session_id },
      runtimeContext: {} as never,
    }) as Promise<{
      message: string;
      attempt: number;
      exhausted: boolean;
    }>;
  }

  beforeEach(() => {
    stubNetwork();
  });

  it("returns attempt 1 with a message", async () => {
    const session_id = await startSession();
    const res = await run(session_id);
    expect(res.attempt).toBe(1);
    expect(res.exhausted).toBe(false);
    expect(res.message.length).toBeGreaterThan(0);
  });

  it("returns attempt 2 on second call", async () => {
    const session_id = await startSession();
    await run(session_id);
    const second = await run(session_id);
    expect(second.attempt).toBe(2);
    expect(second.exhausted).toBe(false);
  });

  it("uses a different message each attempt (no repetitive spam)", async () => {
    const session_id = await startSession();
    const first = await run(session_id);
    const second = await run(session_id);
    expect(first.message).not.toBe(second.message);
  });

  it("never exhausts — the chat stays open indefinitely (decisão 09/08)", async () => {
    const session_id = await startSession();
    // Muitas tentativas seguidas: o chat NUNCA encerra sozinho.
    for (let i = 0; i < 10; i++) {
      const res = await run(session_id);
      expect(res.exhausted).toBe(false);
      expect(res.attempt).toBe(i + 1);
    }
    const { getSession } = await import("../../lib/sessions.ts");
    expect(getSession(session_id)?.reengageAttempts).toBe(10);
  });

  it("cycles messages so it never sounds repetitive", async () => {
    const session_id = await startSession();
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const res = await run(session_id);
      seen.add(res.message);
    }
    // Com 3 mensagens ciclando, 6 tentativas devem repetir (não 6 únicas),
    // mas nunca encerrar.
    expect(seen.size).toBeLessThanOrEqual(3);
    expect(seen.size).toBeGreaterThan(0);
  });

  it("throws for an unknown session", async () => {
    await expect(run("nope")).rejects.toThrow(/sess[aã]o|session|encontrada|expirada/i);
  });
});
