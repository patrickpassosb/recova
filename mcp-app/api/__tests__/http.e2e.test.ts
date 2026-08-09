import { describe, it, expect } from "bun:test";
import { stubNetwork, restoreFetchAfterEach, TEST_CATALOG } from "../tools/__tests__/helpers.ts";
import { app } from "../app.ts";

/**
 * E2E — the full MCP HTTP server surface.
 *
 * Spins up the real `app.fetch` handler (logging middleware + route rewrite
 * + runtime MCP server) and drives it exactly like the demo-storefront's
 * `callTool` helper does: POST a JSON-RPC `tools/call` to `/api/mcp`, parse
 * the SSE `data:` lines, and read `result.structuredContent`.
 *
 * This is the highest-fidelity integration point short of a real browser:
 * it proves the tool registry, schema validation, session storage and the
 * HTTP transport all work together as deployed.
 */
describe("MCP HTTP server (E2E)", () => {
  restoreFetchAfterEach();

  function mcpFetch(body: unknown, path = "/api/mcp") {
    return app.fetch(
      new Request(`http://localhost:3001${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(body),
      }),
    );
  }

  /** Mirrors demo-storefront/src/loaders/searchRecovery.ts `callTool`. */
  async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const res = await mcpFetch({
      jsonrpc: "2.0",
      id: "e2e-1",
      method: "tools/call",
      params: { name, arguments: args },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const payload = JSON.parse(trimmed.slice(6)) as {
        result?: {
          structuredContent?: T;
          content?: Array<{ type: string; text?: string }>;
        };
        error?: { message?: string };
      };
      if (payload.error) throw new Error(payload.error.message);
      const structured = payload.result?.structuredContent;
      if (structured) return structured;
      const textBlock = payload.result?.content?.find((c) => c.type === "text");
      if (textBlock?.text) {
        try {
          return JSON.parse(textBlock.text) as T;
        } catch {
          /* continue */
        }
      }
    }
    throw new Error("No result in MCP response");
  }

  describe("healthcheck & routing", () => {
    it("serves /_healthcheck with 200 OK", async () => {
      const res = await app.fetch(new Request("http://localhost:3001/_healthcheck"));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("OK");
    });

    it("blocks /mcp (non-API path) with 404", async () => {
      const res = await app.fetch(
        new Request("http://localhost:3001/mcp", { method: "POST", body: "{}" }),
      );
      expect(res.status).toBe(404);
    });

    it("rewrites /api/mcp to the MCP handler", async () => {
      stubNetwork();
      const res = await app.fetch(
        new Request("http://localhost:3001/api/mcp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "tools/list", params: {} }),
        }),
      );
      expect(res.status).toBe(200);
    });
  });

  describe("tools/list", () => {
    it("registers all 5 tools", async () => {
      stubNetwork();
      const res = await mcpFetch({
        jsonrpc: "2.0",
        id: "1",
        method: "tools/list",
        params: {},
      });
      const text = await res.text();
      let tools: Array<{ name: string }> = [];
      for (const line of text.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("data: ")) continue;
        const payload = JSON.parse(t.slice(6));
        tools = payload.result?.tools ?? [];
      }
      const names = tools.map((t) => t.name).sort();
      expect(names).toContain("search_recovery");
      expect(names).toContain("converse");
      expect(names).toContain("reengage");
      expect(names).toContain("analyze_zero_results");
      expect(names).toContain("hello_world");
    });
  });

  describe("tools/call over HTTP (search_recovery)", () => {
    it("returns 3+ grounded products via the wire protocol", async () => {
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
      const res = await callTool<{
        session_id: string;
        products: Array<{ id: string; title: string; match_type: string }>;
        explanation: string;
      }>("search_recovery", { query: "tenis" });
      expect(res.session_id).toBeTruthy();
      expect(res.products.length).toBeGreaterThanOrEqual(3);
      for (const p of res.products) {
        expect(TEST_CATALOG.some((c) => c.id === p.id)).toBe(true);
      }
      expect(res.explanation.length).toBeGreaterThan(0);
    });

    it("surfaces schema validation errors for a blank query", async () => {
      stubNetwork();
      const res = await mcpFetch({
        jsonrpc: "2.0",
        id: "2",
        method: "tools/call",
        params: { name: "search_recovery", arguments: { query: "   " } },
      });
      const text = await res.text();
      let error = false;
      for (const line of text.split("\n")) {
        if (line.includes('"isError":true') || line.includes('"error"')) error = true;
      }
      expect(error).toBe(true);
    });
  });
});
