import { describe, it, expect, beforeEach } from "bun:test";
import { stubNetwork, restoreFetchAfterEach, TEST_CATALOG } from "./helpers.ts";
import { searchRecoveryTool } from "../searchRecovery.ts";

/**
 * Integration tests for T1 — search_recovery.
 *
 * These exercise the full execute path (intent understanding → combined
 * lexical search → padding/bestsellers → session + messages) against the
 * real code, with only the network boundary (Shopify catalog + Ollama LLM)
 * stubbed to deterministic fixtures.
 */
describe("search_recovery tool", () => {
  restoreFetchAfterEach();

  const tool = searchRecoveryTool({} as never);

  function run(input: { query: string; session_id?: string }) {
    return tool.execute({
      context: input,
      runtimeContext: {} as never,
    }) as Promise<{
      session_id: string;
      products: Array<{
        id: string;
        title: string;
        price: number;
        score: number;
        match_type: string;
        variant_id: string | null;
      }>;
      explanation: string;
      follow_up_question: string;
      refinement_options?: string[];
    }>;
  }

  describe("happy path (LLM available)", () => {
    beforeEach(() => {
      stubNetwork({
        llm: {
          content: JSON.stringify({
            terms: ["shoes", "canvas shoes"],
            category: "calçado",
            max_price: null,
            refinement_options: ["Casual", "Esportivo", "Dia a dia"],
          }),
        },
      });
    });

    it("returns 3+ grounded products with a session id", async () => {
      const res = await run({ query: "tenis de corrida" });
      expect(res.session_id).toBeTruthy();
      expect(res.products.length).toBeGreaterThanOrEqual(3);
      // Every product comes from the fixture catalog (no hallucination)
      for (const p of res.products) {
        expect(TEST_CATALOG.some((c) => c.id === p.id)).toBe(true);
      }
    });

    it("returns dynamic refinement_options from the LLM", async () => {
      const res = await run({ query: "capivara" });
      expect(res.refinement_options).toEqual([
        "Casual",
        "Esportivo",
        "Dia a dia",
      ]);
    });

    it("fills explanation and follow-up question", async () => {
      const res = await run({ query: "tenis" });
      expect(res.explanation.length).toBeGreaterThan(0);
      expect(res.follow_up_question.length).toBeGreaterThan(0);
    });

    it("respects a max price extracted from the query", async () => {
      const res = await run({ query: "tenis até 100" });
      expect(res.products.length).toBeGreaterThan(0);
      for (const p of res.products) {
        expect(p.price).toBeLessThanOrEqual(100);
      }
    });

    it("pads with bestsellers to reach 3 when results are short", async () => {
      // Query that matches only a niche product, capped low → padding kicks in
      const res = await run({ query: "caneta" });
      expect(res.products.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("fallback path (LLM unavailable)", () => {
    beforeEach(() => {
      stubNetwork({ llm: { httpError: true } });
    });

    it("falls back to lexical search without throwing", async () => {
      const res = await run({ query: "camiseta oversized" });
      expect(res.products.length).toBeGreaterThanOrEqual(3);
      expect(res.explanation.length).toBeGreaterThan(0);
    });

    it("provides default refinement options on fallback for a fresh query", async () => {
      // Fresh query (not in the intent cache) → fallback supplies default chips
      const res = await run({ query: "mochila para notebook" });
      expect(res.refinement_options?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("zero-results recovery", () => {
    beforeEach(() => {
      stubNetwork({
        llm: {
          content: JSON.stringify({
            terms: ["plutonium"], // not in catalog
            category: null,
            max_price: null,
            refinement_options: [],
          }),
        },
      });
    });

    it("recovers with popular products and a bestseller explanation", async () => {
      const res = await run({ query: "nada que exista" });
      expect(res.products.length).toBeGreaterThanOrEqual(1);
      expect(res.explanation.toLowerCase()).toContain("populares");
    });

    it("respects max price even in the bestseller fallback", async () => {
      const res = await run({ query: "xyz até 50" });
      for (const p of res.products) {
        expect(p.price).toBeLessThanOrEqual(50);
      }
    });
  });

  describe("session continuity", () => {
    beforeEach(() => {
      stubNetwork({
        llm: {
          content: JSON.stringify({
            terms: ["shoes", "canvas shoes"],
            category: "calçado",
            max_price: null,
            refinement_options: ["Casual", "Esportivo"],
          }),
        },
      });
    });

    it("accumulates deduplicated suggestions across iterations", async () => {
      const first = await run({ query: "tenis" });
      const second = await run({ query: "tenis", session_id: first.session_id });
      // The session should not duplicate a suggested id internally, and the
      // second response still fulfills the 3+ product contract.
      expect(second.products.length).toBeGreaterThanOrEqual(3);
      // The first call's products must have been recorded as suggested
      const { getSession } = await import("../../lib/sessions.ts");
      const s = getSession(first.session_id);
      expect(s).toBeDefined();
      expect(s!.suggestedProductIds.length).toBeGreaterThanOrEqual(
        first.products.length,
      );
      const seen = new Set(s!.suggestedProductIds);
      expect(seen.size).toBe(s!.suggestedProductIds.length); // no dupes
    });
  });

  describe("input validation", () => {
    it("rejects empty/whitespace queries via schema", () => {
      // The schema refines trim().length > 0; execute receives validated input,
      // so a blank query should fail schema validation when parsed.
      const { searchRecoveryInputSchema } = require("../searchRecovery.ts") as typeof import("../searchRecovery.ts");
      const parsed = searchRecoveryInputSchema.safeParse({ query: "   " });
      expect(parsed.success).toBe(false);
    });
  });
});
