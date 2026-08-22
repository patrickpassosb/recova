import { ShopperAgent } from "../src/agents/shopper.js";
import { getMerchant } from "../src/config/merchants.js";

/**
 * Stub-mode eval suite (W05).
 *
 * Asserts the four route fixtures against STUB_GEMINI mode (deterministic,
 * network-free). Run via `npm run eval`. Exits non-zero on any failure.
 */

process.env.STUB_GEMINI = "true";

interface Fixture {
  name: string;
  query: string;
  nativeResultIds: string[];
  expectRoute: "NATIVE_OK" | "RECOVER" | "CLARIFY";
}

const FIXTURES: Fixture[] = [
  {
    name: "zero-results",
    query: "a dress under $200",
    nativeResultIds: [],
    expectRoute: "RECOVER",
  },
  {
    name: "strong-query",
    query: "a dress",
    nativeResultIds: ["p_train_2282"],
    expectRoute: "NATIVE_OK",
  },
  {
    name: "ambiguous",
    query: "hello",
    nativeResultIds: [],
    expectRoute: "CLARIFY",
  },
];

async function main(): Promise<void> {
  const merchant = getMerchant("demo");
  if (!merchant || !merchant.active) {
    console.error("FAIL: demo merchant is not active");
    process.exit(1);
  }
  const agent = new ShopperAgent(merchant.catalogAdapter);

  let pass = 0;
  let fail = 0;

  for (const f of FIXTURES) {
    const decision = await agent.evaluate({
      query: f.query,
      nativeResultIds: f.nativeResultIds,
      sessionId: "eval",
    });
    const ok = decision.route === f.expectRoute;
    if (ok) pass++;
    else fail++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${f.name}: route=${decision.route} (expected ${f.expectRoute})`,
    );
  }

  // Unknown storeId resolves to null (the HTTP layer returns 404, no fallback).
  const unknown = getMerchant("does-not-exist");
  if (unknown === null) {
    pass++;
    console.log("PASS unknown-storeId: resolves to null (HTTP 404)");
  } else {
    fail++;
    console.log("FAIL unknown-storeId: expected null");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
