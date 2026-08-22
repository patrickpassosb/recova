import { ShopperAgent } from "../src/agents/shopper.js";
import { getMerchant } from "../src/config/merchants.js";
import { GeminiClient } from "../src/llm/gemini.js";

/**
 * Real-model harness (W05) — MANUAL ONLY, never run by CI.
 *
 * Requires a real `GEMINI_API_KEY` (and `STUB_GEMINI` unset). It makes one
 * real Gemini call to demonstrate the LLM layer, then runs the deterministic
 * recovery orchestration, printing the decision and measured latency.
 *
 * Invoke:
 *   GEMINI_API_KEY=... npx tsx evals/run-real-model.ts ["<query>"]
 *
 * The optional query defaults to "hello" (a CLARIFY route, which exercises the
 * LLM clarification prompt).
 */

async function main(): Promise<void> {
  if (process.env.STUB_GEMINI === "true") {
    console.error(
      "STUB_GEMINI=true; run-real-model requires a real model. Unset STUB_GEMINI and set GEMINI_API_KEY.",
    );
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is required (see docs/AGENT_GATEWAY.md).");
    process.exit(1);
  }

  const query = process.argv[2] ?? "hello";

  // 1. Demonstrate the LLM layer with a real model call.
  const llm = new GeminiClient();
  const llmStart = Date.now();
  const llmText = await llm.generateText(
    `Shopper query: ${query}\nWrite one targeted clarification question.`,
    "refinement-prompt",
  );
  const llmLatency = Date.now() - llmStart;

  // 2. Run the deterministic recovery orchestration.
  const merchant = getMerchant("demo");
  if (!merchant || !merchant.active) {
    console.error("demo merchant is not active");
    process.exit(1);
  }
  const agent = new ShopperAgent(merchant.catalogAdapter);
  const evalStart = Date.now();
  const decision = await agent.evaluate({
    query,
    nativeResultIds: [],
    sessionId: "real-eval",
  });
  const evalLatency = Date.now() - evalStart;

  console.log(
    JSON.stringify(
      {
        query,
        model: llm.model,
        llmLatencyMs: llmLatency,
        llmOutput: llmText,
        evalLatencyMs: evalLatency,
        decision,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
