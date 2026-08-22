import { afterEach, describe, expect, it } from "bun:test";
import recoveryGateway from "../recoveryGateway.ts";
import type { RecoveryDecision } from "../recoveryGateway.ts";

/**
 * Tests for the recovery gateway loader — the server-side proxy to the
 * recovery agent's HTTP API.
 *
 * We stub `globalThis.fetch` to exercise the real request path, including the
 * runtime validation that rejects malformed 2xx responses before they can
 * reach `DecisionCards` and crash the zero-results view.
 */

function validDecision(): RecoveryDecision {
  return {
    sessionId: "sess-1",
    route: "RECOVER",
    strategy: "EXACT_ALTERNATIVE",
    activationReasons: ["native search returned zero results"],
    constraints: [{ kind: "size", value: "M", hardness: "hard", sourceText: "size M" }],
    cards: [
      {
        productId: "p-1",
        variantId: "v-1",
        handle: "product-1",
        title: "Product 1",
        imageUrl: null,
        price: 100,
        available: true,
        selectedOptions: [{ name: "Size", value: "M" }],
        matchScore: 1,
        satisfied: ["size"],
        relaxedSoft: [],
        unknown: [],
        reason: "satisfies size",
        rank: 1,
      },
    ],
    rejectedCandidates: [],
    refinementPrompt: null,
    refinementOptions: [],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("recoveryGateway", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the validated decision for a well-formed response", async () => {
    globalThis.fetch = (async () => jsonResponse(validDecision())) as typeof fetch;
    const res = await recoveryGateway({ query: "shoes" });
    expect(res).toMatchObject({ sessionId: "sess-1", route: "RECOVER" });
    expect(res?.cards.length).toBe(1);
  });

  it("returns null for a malformed 2xx response missing required fields", async () => {
    // A 200 with only `route` — previously accepted by the type-cast and then
    // crashed DecisionCards on `decision.cards.length`.
    globalThis.fetch = (async () => jsonResponse({ route: "RECOVER" })) as typeof fetch;
    const res = await recoveryGateway({ query: "shoes" });
    expect(res).toBeNull();
  });

  it("returns null when cards is not an array", async () => {
    const malformed = { ...validDecision(), cards: "not-an-array" };
    globalThis.fetch = (async () => jsonResponse(malformed)) as typeof fetch;
    const res = await recoveryGateway({ query: "shoes" });
    expect(res).toBeNull();
  });

  it("returns null when a card is missing required fields", async () => {
    const malformed = validDecision();
    malformed.cards = [{ productId: "p-1" } as RecoveryDecision["cards"][number]];
    globalThis.fetch = (async () => jsonResponse(malformed)) as typeof fetch;
    const res = await recoveryGateway({ query: "shoes" });
    expect(res).toBeNull();
  });

  it("returns null for a non-2xx response", async () => {
    globalThis.fetch = (async () => jsonResponse({ error: "down" }, 503)) as typeof fetch;
    const res = await recoveryGateway({ query: "shoes" });
    expect(res).toBeNull();
  });

  it("returns null when the response body is not JSON", async () => {
    globalThis.fetch = (async () => new Response("not json", { status: 200 })) as typeof fetch;
    const res = await recoveryGateway({ query: "shoes" });
    expect(res).toBeNull();
  });

  it("returns null early when the query is empty", async () => {
    const res = await recoveryGateway({ query: "" });
    expect(res).toBeNull();
  });
});
