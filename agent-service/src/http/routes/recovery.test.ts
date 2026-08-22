import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "../server.js";
import { StressTestCatalogAdapter } from "../../adapters/stress-test-catalog.js";
import type { RecoveryDecision } from "../../domain/schemas.js";

/**
 * Recovery HTTP route tests (W05).
 *
 * Run in STUB_GEMINI mode so the LLM layer is deterministic and network-free.
 * The deterministic domain tools remain authoritative over routing and ID
 * grounding.
 */

process.env.STUB_GEMINI = "true";

async function withServer(
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createApp();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

async function post(
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

/** The full catalog universe (product + variant IDs) for ID-grounding checks. */
async function catalogUniverse(): Promise<{
  productIds: Set<string>;
  variantIds: Set<string>;
}> {
  const adapter = new StressTestCatalogAdapter();
  const products = await adapter.listProducts();
  const productIds = new Set<string>();
  const variantIds = new Set<string>();
  for (const p of products) {
    productIds.add(p.productId);
    for (const v of p.variants) variantIds.add(v.variantId);
  }
  return { productIds, variantIds };
}

function withoutSessionId(d: RecoveryDecision): RecoveryDecision {
  return { ...d, sessionId: "" };
}

test("evaluate: unknown storeId returns 404", async () => {
  await withServer(async (baseUrl) => {
    const { status, json } = await post(baseUrl, "/v1/recovery/evaluate", {
      storeId: "does-not-exist",
      query: "a dress",
    });
    assert.equal(status, 404);
    assert.ok((json as { error: string }).error.includes("does-not-exist"));
  });
});

test("evaluate: zero-results query recovers with grounded cards", async () => {
  await withServer(async (baseUrl) => {
    const { status, json } = await post(baseUrl, "/v1/recovery/evaluate", {
      storeId: "demo",
      query: "a dress under $200",
    });
    assert.equal(status, 200);
    const decision = json as RecoveryDecision;
    assert.equal(decision.route, "RECOVER");
    assert.ok(decision.cards.length > 0, "recovery produces cards");
    assert.ok(decision.cards.length <= 3, "at most three cards");

    const { productIds, variantIds } = await catalogUniverse();
    for (const card of decision.cards) {
      assert.ok(
        productIds.has(card.productId),
        `card productId ${card.productId} is in the adapter universe`,
      );
      assert.ok(
        variantIds.has(card.variantId),
        `card variantId ${card.variantId} is in the adapter universe`,
      );
    }
  });
});

test("evaluate: strong native query stays hidden (NATIVE_OK)", async () => {
  await withServer(async (baseUrl) => {
    const { status, json } = await post(baseUrl, "/v1/recovery/evaluate", {
      storeId: "demo",
      query: "a dress",
      nativeResultIds: ["p_train_2282"],
    });
    assert.equal(status, 200);
    const decision = json as RecoveryDecision;
    assert.equal(decision.route, "NATIVE_OK");
    assert.equal(decision.cards.length, 0);
    assert.equal(decision.strategy, null);
  });
});

test("evaluate: ambiguous query clarifies", async () => {
  await withServer(async (baseUrl) => {
    const { status, json } = await post(baseUrl, "/v1/recovery/evaluate", {
      storeId: "demo",
      query: "hello",
    });
    assert.equal(status, 200);
    const decision = json as RecoveryDecision;
    assert.equal(decision.route, "CLARIFY");
    assert.equal(decision.cards.length, 0);
    assert.ok(decision.refinementPrompt, "clarification prompt is present");
  });
});

test("evaluate: STUB_GEMINI determinism (two evaluations are identical)", async () => {
  await withServer(async (baseUrl) => {
    const body = { storeId: "demo", query: "a dress under $200" };
    const first = await post(baseUrl, "/v1/recovery/evaluate", body);
    const second = await post(baseUrl, "/v1/recovery/evaluate", body);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.deepEqual(
      withoutSessionId(first.json as RecoveryDecision),
      withoutSessionId(second.json as RecoveryDecision),
    );
  });
});

test("refine: unknown sessionId returns 404", async () => {
  await withServer(async (baseUrl) => {
    const { status, json } = await post(baseUrl, "/v1/recovery/refine", {
      sessionId: "does-not-exist",
      userResponse: "size M",
    });
    assert.equal(status, 404);
    assert.ok((json as { error: string }).error.includes("does-not-exist"));
  });
});

test("refine: folds the user response into the same session", async () => {
  await withServer(async (baseUrl) => {
    const evaluated = await post(baseUrl, "/v1/recovery/evaluate", {
      storeId: "demo",
      query: "a dress",
    });
    assert.equal(evaluated.status, 200);
    const sessionId = (evaluated.json as RecoveryDecision).sessionId;

    const refined = await post(baseUrl, "/v1/recovery/refine", {
      sessionId,
      userResponse: "under $200",
    });
    assert.equal(refined.status, 200);
    const decision = refined.json as RecoveryDecision;
    assert.equal(decision.sessionId, sessionId, "refine keeps the same session");
    assert.equal(decision.route, "RECOVER");
  });
});
