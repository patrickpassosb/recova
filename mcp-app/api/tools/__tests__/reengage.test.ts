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
      attempt: 1 | 2;
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

  it("marks exhausted=true on the third call and stops sending", async () => {
    const session_id = await startSession();
    await run(session_id); // 1
    await run(session_id); // 2
    const third = await run(session_id); // exhausted
    expect(third.exhausted).toBe(true);
    expect(third.attempt).toBe(2);
    // Attempts must not exceed 2
    const { getSession } = await import("../../lib/sessions.ts");
    expect(getSession(session_id)?.reengageAttempts).toBe(2);
  });

  it("throws for an unknown session", async () => {
    await expect(run("nope")).rejects.toThrow(/sess[aã]o|session|encontrada|expirada/i);
  });
});
