import { describe, it, expect, afterEach } from "bun:test";
import searchRecoveryLoader from "../searchRecovery.ts";

/**
 * Integration tests for the storefront's searchRecovery loader — the
 * server-side proxy that talks to the agent-service V2 recovery gateway
 * (`/v1/recovery/evaluate` and `/v1/recovery/refine`).
 *
 * We stub `globalThis.fetch` to return V2 RecoveryDecision payloads,
 * exercising the real HTTP calls, boundary guards, action routing, and the
 * RecoveryDecision → RecoveryResult mapping consumed by SearchRecoveryOverlay.
 */

function v2Decision(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "sess-1",
    route: "RECOVER",
    strategy: "QUERY_REPAIR",
    activationReasons: ["native search returned zero results"],
    constraints: [],
    cards: [
      {
        productId: "gid://shopify/Product/1",
        variantId: "gid://shopify/ProductVariant/11",
        handle: "high-top-canvas-shoes",
        title: "High Top Canvas Shoes",
        imageUrl: null,
        price: 120,
        available: true,
        selectedOptions: [],
        matchScore: 0.8,
        satisfied: [],
        relaxedSoft: [],
        unknown: [],
        reason: "matches query",
        rank: 1,
      },
    ],
    rejectedCandidates: [],
    refinementPrompt: "Qual faixa de preço?",
    refinementOptions: ["Casual", "Esportivo"],
    ...overrides,
  };
}

describe("searchRecoveryLoader (V2 gateway)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function stubFetch(status: number, body: unknown) {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
  }

  it("search_recovery maps RECOVER decision to RecoveryResult products", async () => {
    stubFetch(200, v2Decision());
    const result = await searchRecoveryLoader({ query: "tenis", action: "search_recovery" });
    expect(result).not.toBeNull();
    if (result && "products" in result) {
      expect(result.session_id).toBe("sess-1");
      expect(result.products.length).toBe(1);
      expect(result.products[0].title).toBe("High Top Canvas Shoes");
      expect(result.products[0].variant_id).toBe("gid://shopify/ProductVariant/11");
      expect(result.products[0].match_type).toBe("MATCH");
      expect(result.refinement_options).toEqual(["Casual", "Esportivo"]);
    }
  });

  it("search_recovery maps CLARIFY to prompt + chips with no products", async () => {
    stubFetch(200, v2Decision({ route: "CLARIFY", cards: [] }));
    const result = await searchRecoveryLoader({ query: "zeeker", action: "search_recovery" });
    expect(result).not.toBeNull();
    if (result && "products" in result) {
      expect(result.products.length).toBe(0);
      expect(result.explanation).toContain("preço");
      expect(result.refinement_options).toEqual(["Casual", "Esportivo"]);
    }
  });

  it("search_recovery returns null on NATIVE_OK and on non-200", async () => {
    stubFetch(200, v2Decision({ route: "NATIVE_OK" }));
    expect(await searchRecoveryLoader({ query: "hoodie", action: "search_recovery" })).toBeNull();

    stubFetch(500, { error: "boom" });
    expect(await searchRecoveryLoader({ query: "hoodie", action: "search_recovery" })).toBeNull();
  });

  it("converse calls /refine with the session id", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(v2Decision()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await searchRecoveryLoader({
      session_id: "sess-1",
      user_response: "só preto",
      action: "converse",
    });
    expect(capturedUrl).toContain("/v1/recovery/refine");
    expect(capturedBody).toEqual({ sessionId: "sess-1", userResponse: "só preto" });
    expect(result).not.toBeNull();
  });

  it("converse requires session_id and user_response", async () => {
    expect(await searchRecoveryLoader({ action: "converse" })).toBeNull();
  });

  it("unsupported V2 actions are no-ops (null)", async () => {
    for (const action of ["reengage", "analyze", "dashboard", "track_event"] as const) {
      expect(
        await searchRecoveryLoader({ action, session_id: "s", event: { event: "x" } }),
      ).toBeNull();
    }
  });

  it("returns null when fetch throws", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    expect(await searchRecoveryLoader({ query: "x", action: "search_recovery" })).toBeNull();
  });
});
