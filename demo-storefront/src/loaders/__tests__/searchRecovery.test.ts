import { describe, it, expect, afterEach } from "bun:test";
import searchRecoveryLoader from "../searchRecovery.ts";

/**
 * Integration tests for the storefront's searchRecovery loader — the
 * server-side proxy that talks to the MCP agent over HTTP/SSE.
 *
 * We stub `globalThis.fetch` to return MCP-style SSE payloads, exercising the
 * real SSE parsing, `structuredContent`/text fallback, and action routing in
 * `callTool`.
 */
describe("searchRecoveryLoader", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /** Returns an MCP SSE body containing a structuredContent result. */
  function sseResult(structured: unknown): Response {
    const text = `event: message\ndata: ${JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      result: {
        structuredContent: structured,
        content: [{ type: "text", text: JSON.stringify(structured) }],
      },
    })}\n\n`;
    return new Response(text, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const recoveryResult = {
    session_id: "sess-1",
    products: [
      {
        id: "gid://1",
        title: "High Top Canvas Shoes",
        price: 120,
        image: null,
        score: 0.8,
        match_type: "MATCH",
        variant_id: "var-1",
      },
    ],
    explanation: "Encontrei tênis para você.",
    follow_up_question: "Gosta?",
    refinement_options: ["Casual", "Esportivo"],
  };

  it("search_recovery returns the structured result", async () => {
    globalThis.fetch = (async () => sseResult(recoveryResult)) as typeof fetch;
    const res = await searchRecoveryLoader({ query: "tenis" });
    expect(res).toMatchObject({ session_id: "sess-1" });
    expect((res as typeof recoveryResult).products.length).toBeGreaterThan(0);
  });

  it("returns null early for search_recovery without a query", async () => {
    const res = await searchRecoveryLoader({});
    expect(res).toBeNull();
  });

  it("routes converse action with session + response", async () => {
    globalThis.fetch = (async () => sseResult(recoveryResult)) as typeof fetch;
    const res = await searchRecoveryLoader({
      action: "converse",
      session_id: "sess-1",
      user_response: "quero casual",
    });
    expect(res).toMatchObject({ session_id: "sess-1" });
  });

  it("returns null for converse without session or response", async () => {
    const res = await searchRecoveryLoader({ action: "converse", session_id: "sess-1" });
    expect(res).toBeNull();
  });

  it("routes reengage action", async () => {
    globalThis.fetch = (async () =>
      sseResult({ message: "Ei!", attempt: 1, exhausted: false })) as typeof fetch;
    const res = await searchRecoveryLoader({
      action: "reengage",
      session_id: "sess-1",
    });
    expect(res).toMatchObject({ attempt: 1, exhausted: false });
  });

  it("routes analyze action", async () => {
    globalThis.fetch = (async () =>
      sseResult({
        report: [{ term: "bicicleta", volume: 10, cause: "nao_catalogado", suggested_fix: "x" }],
        summary: "Resumo",
      })) as typeof fetch;
    const res = await searchRecoveryLoader({ action: "analyze" });
    expect(res).toMatchObject({ report: [{ term: "bicicleta" }] });
  });

  it("falls back to parsing JSON from the text content block", async () => {
    // SSE with no structuredContent but a JSON text block
    const text = `data: ${JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      result: { content: [{ type: "text", text: JSON.stringify(recoveryResult) }] },
    })}\n\n`;
    globalThis.fetch = (async () =>
      new Response(text, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })) as typeof fetch;
    const res = await searchRecoveryLoader({ query: "tenis" });
    expect(res).toMatchObject({ session_id: "sess-1" });
  });

  it("returns null and swallows errors when the MCP server is down", async () => {
    globalThis.fetch = (async () =>
      new Response("down", { status: 503 })) as typeof fetch;
    const res = await searchRecoveryLoader({ query: "tenis" });
    expect(res).toBeNull();
  });

  it("throws an error surfaced from the MCP error payload", async () => {
    // The loader catches fetch-level errors, but an MCP error payload is a
    // successful HTTP response; callTool throws, loader returns null.
    const text = `data: ${JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      error: { message: "Sessão expirada" },
    })}\n\n`;
    globalThis.fetch = (async () =>
      new Response(text, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })) as typeof fetch;
    const res = await searchRecoveryLoader({ action: "converse", session_id: "x", user_response: "oi" });
    expect(res).toBeNull();
  });
});
