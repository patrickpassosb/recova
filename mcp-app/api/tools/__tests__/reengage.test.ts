import { beforeEach, describe, expect, it } from "bun:test";
import { reengageTool } from "../reengage.ts";
import { searchRecoveryTool } from "../searchRecovery.ts";
import { restoreFetchAfterEach, stubNetwork } from "./helpers.ts";

/**
 * Integration tests for T3 — reengage (60s timeout, max 2 attempts, no spam).
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
		expect(second.exhausted).toBe(true);
	});

	it("uses a different message each attempt (no repetitive spam)", async () => {
		const session_id = await startSession();
		const first = await run(session_id);
		const second = await run(session_id);
		expect(first.message).not.toBe(second.message);
	});

	it("stops after two automatic messages without closing the chat", async () => {
		const session_id = await startSession();
		await run(session_id);
		const second = await run(session_id);
		const third = await run(session_id);
		expect(second.exhausted).toBe(true);
		expect(third).toEqual({ message: "", attempt: 2, exhausted: true });
		const { getSession } = await import("../../lib/sessions.ts");
		expect(getSession(session_id)?.reengageAttempts).toBe(2);
	});

	it("throws for an unknown session", async () => {
		await expect(run("nope")).rejects.toThrow(
			/sess[aã]o|session|encontrada|expirada/i,
		);
	});
});
