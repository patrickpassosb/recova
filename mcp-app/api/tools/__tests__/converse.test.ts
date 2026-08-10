import { beforeEach, describe, expect, it } from "bun:test";
import { converseTool } from "../converse.ts";
import { searchRecoveryTool } from "../searchRecovery.ts";
import { restoreFetchAfterEach, stubNetwork } from "./helpers.ts";

/**
 * Integration tests for T2 — converse (the conversation loop).
 *
 * Starts a real session via search_recovery, then drives refinements through
 * converse with a stubbed LLM, verifying the loop contract: 3+ products,
 * new explanation + follow-up, session history preserved.
 */
describe("converse tool", () => {
	restoreFetchAfterEach();

	const converse = converseTool({} as never);
	const search = searchRecoveryTool({} as never);

	type ToolResult = {
		session_id: string;
		products: Array<{
			id: string;
			title: string;
			description: string | null;
			price: number;
			match_type: string;
		}>;
		explanation: string;
		follow_up_question: string;
		refinement_options?: string[];
	};

	async function startSession(query = "tenis"): Promise<string> {
		const res = (await search.execute({
			context: { query },
			runtimeContext: {} as never,
		})) as ToolResult;
		return res.session_id;
	}

	function run(session_id: string, user_response: string) {
		return converse.execute({
			context: { session_id, user_response },
			runtimeContext: {} as never,
		}) as Promise<ToolResult>;
	}

	describe("happy path", () => {
		beforeEach(() => {
			stubNetwork({
				llm: {
					// First chat call (intent) → refinement JSON; second chat call
					// (explanation) → natural explanation JSON. The helper returns the
					// same content for every call, so we shape it to work for both by
					// returning the refinement shape plus explanation fields.
					content: JSON.stringify({
						terms: ["shoes", "canvas shoes"],
						max_price: null,
						sort_by_price: "asc",
						refinement_options: ["Casual", "Esportivo"],
						explanation: "Encontrei calçados que combinam com você.",
						follow_up_question: "Prefere os mais baratos?",
					}),
				},
			});
		});

		it("continues the loop with 3+ products and a new question", async () => {
			const session_id = await startSession("tenis");
			const res = await run(session_id, "quero os mais baratos");
			expect(res.products.length).toBeGreaterThanOrEqual(3);
			expect(res.explanation.length).toBeGreaterThan(0);
			expect(res.follow_up_question.length).toBeGreaterThan(0);
		});

		it("sorts ascending when the user asks for cheapest", async () => {
			const session_id = await startSession("tenis");
			const res = await run(session_id, "quero o mais barato");
			const prices = res.products.map((p) => p.price);
			const sorted = [...prices].sort((a, b) => a - b);
			expect(prices).toEqual(sorted);
		});

		it("preserves the session across turns", async () => {
			const session_id = await startSession("tenis");
			const first = await run(session_id, "prefiro esportivo");
			const second = await run(session_id, "agora quero algo casual");
			expect(second.session_id).toBe(first.session_id);
			expect(second.products.length).toBeGreaterThanOrEqual(3);
		});

		it("does not repeat product ids across 3 consecutive iterations", async () => {
			// Sem sort_by_price: o filtro de novidade (não repetir produtos já
			// sugeridos) se aplica. Com sort_by_price o converse re-emfatiza itens
			// já vistos por design (re-ranqueamento), então não testamos no-repeat aí.
			stubNetwork({
				llm: {
					content: JSON.stringify({
						terms: ["shoes", "canvas shoes"],
						max_price: null,
						sort_by_price: null,
						refinement_options: ["Casual", "Esportivo"],
					}),
				},
			});
			const session_id = await startSession("tenis");
			const seen = new Set<string>();
			for (let i = 0; i < 3; i++) {
				const res = await run(session_id, `refinamento ${i}`);
				expect(res.products.length).toBeGreaterThanOrEqual(3);
				for (const p of res.products) {
					expect(seen.has(p.id)).toBe(false);
					seen.add(p.id);
				}
			}
		});
	});

	describe("fallback (LLM unavailable)", () => {
		beforeEach(() => {
			stubNetwork({ llm: { httpError: true } });
		});

		it("falls back to lexical refinement without throwing", async () => {
			const session_id = await startSession("tenis");
			const res = await run(session_id, "quero uma caneca de café");
			expect(res.products.length).toBeGreaterThanOrEqual(1);
			expect(res.explanation.length).toBeGreaterThan(0);
			expect(res.follow_up_question.length).toBeGreaterThan(0);
		});

		it("keeps recommending products after a greeting and a generic follow-up", async () => {
			const session_id = await startSession("hi");
			const res = await run(session_id, "quero ver mais");
			expect(res.products.length).toBeGreaterThanOrEqual(1);
			expect(res.explanation.length).toBeGreaterThan(0);
			expect(res.follow_up_question.length).toBeGreaterThan(0);
		});
	});

	describe("validation & errors", () => {
		beforeEach(() => {
			stubNetwork();
		});

		it("throws for an unknown session", async () => {
			await expect(run("does-not-exist", "oi")).rejects.toThrow(
				/sess[aã]o|session|encontrada|expirada/i,
			);
		});

		it("rejects empty user responses via schema", () => {
			const { converseInputSchema } =
				require("../converse.ts") as typeof import("../converse.ts");
			expect(
				converseInputSchema.safeParse({ session_id: "x", user_response: " " })
					.success,
			).toBe(false);
			expect(
				converseInputSchema.safeParse({ session_id: "x", user_response: "ola" })
					.success,
			).toBe(true);
		});
	});
});
