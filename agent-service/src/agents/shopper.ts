import { z } from "zod";
import { FunctionTool, LlmAgent } from "@google/adk";
import type { CatalogAdapter } from "../adapters/interfaces.js";
import { buildDecisionCards, type CatalogCandidate, type CandidateEvaluation } from "../domain/cards.js";
import { extractConstraints } from "../domain/constraints.js";
import {
  RecoveryDecisionSchema,
  ShopperConstraintSchema,
  type RecoveryDecision,
} from "../domain/schemas.js";
import { route, validateCandidates } from "../domain/solver.js";
import type { RecoverySession, SessionStore } from "../config/sessions.js";
import { createAdkModel, GeminiClient, type GeminiClientOptions } from "../llm/gemini.js";
import { toCatalogCandidates } from "./catalog-bridge.js";

/**
 * ADK shopper agent (docs/PLAN_FINAL.md §5.1).
 *
 * The agent turns a failed native search into a `RecoveryDecision`. It is a
 * Google ADK `LlmAgent` wired with Gemini 3.7 Flash and a bounded set of tools
 * mapped to deterministic domain functions. The deterministic domain layer
 * remains authoritative over catalog truth and hard-constraint enforcement:
 * the LLM may interpret intent and write explanations, but it can never invent
 * products, variants, prices, availability, or catalog evidence.
 *
 * The agent has **no** cart/checkout tools. Commerce happens only through the
 * HTTP route layer, never through the agent.
 */

// ---------------------------------------------------------------------------
// Tool parameter schemas (Zod-validated contract objects)
// ---------------------------------------------------------------------------

const NativeResultIdsSchema = z.object({
  nativeResultIds: z.array(z.string()),
});

const QuerySchema = z.object({ query: z.string() });

const SearchCatalogSchema = z.object({
  query: z.string(),
  constraints: z.array(ShopperConstraintSchema).optional(),
});

const ValidateCandidatesSchema = z.object({
  candidates: z.array(z.unknown()),
  constraints: z.array(ShopperConstraintSchema),
});

const PrepareCardsSchema = z.object({
  valid: z.array(z.unknown()),
  constraints: z.array(ShopperConstraintSchema),
});

const RefineSessionSchema = z.object({
  sessionId: z.string(),
  userResponse: z.string(),
});

// ---------------------------------------------------------------------------
// Deterministic orchestration (authoritative path)
// ---------------------------------------------------------------------------

export interface EvaluateInput {
  query: string;
  nativeResultIds?: string[];
  sessionId?: string;
}

/**
 * Deterministic recovery evaluation: extract constraints → search the catalog
 * → map to candidates → route. The LLM is used only to write a natural
 * clarification prompt for `CLARIFY` decisions (best-effort; the deterministic
 * prompt is kept on failure).
 */
export async function evaluateRecovery(
  adapter: CatalogAdapter,
  input: EvaluateInput,
  llm?: GeminiClient,
): Promise<RecoveryDecision> {
  const constraints = extractConstraints(input.query);
  const results = await adapter.search(input.query, constraints);
  const candidates = toCatalogCandidates(results.map((r) => r.product));
  const decision = route(input.nativeResultIds ?? [], candidates, constraints, {
    sessionId: input.sessionId,
  });

  if (decision.route === "CLARIFY" && llm) {
    try {
      // Gemini free tier can stall for 20+s on transient 503s (model under
      // high demand). The storefront callers time out around 10s, so bound
      // the best-effort prompt-writer to 5s and keep the deterministic
      // prompt when the model is slow or down.
      const PROMPT_WRITER_TIMEOUT_MS = 5_000;
      const prompt = await Promise.race([
        llm.generateText(
          `Shopper query: ${input.query}\nWrite one targeted clarification question.`,
          "refinement-prompt",
        ),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("prompt-writer timeout")),
            PROMPT_WRITER_TIMEOUT_MS,
          )
        ),
      ]);
      if (prompt.trim()) decision.refinementPrompt = prompt.trim();
    } catch {
      // Keep the deterministic prompt on LLM failure or timeout.
    }
  }

  return RecoveryDecisionSchema.parse(decision);
}

/**
 * Deterministic refinement: fold the user's response into the original query
 * and re-evaluate within the same session.
 */
export async function refineRecovery(
  adapter: CatalogAdapter,
  session: RecoverySession,
  userResponse: string,
  llm?: GeminiClient,
): Promise<RecoveryDecision> {
  const combinedQuery = `${session.query} ${userResponse}`.trim();
  return evaluateRecovery(
    adapter,
    {
      query: combinedQuery,
      nativeResultIds: session.nativeResultIds,
      sessionId: session.sessionId,
    },
    llm,
  );
}

// ---------------------------------------------------------------------------
// ADK tools
// ---------------------------------------------------------------------------

/**
 * Build a `FunctionTool` from a typed Zod parameter schema and a typed
 * execute function. The ADK bundles its own zod (v4) while this project uses
 * zod v3, so the schema and execute are cast to the ADK's expected types; the
 * schemas are only used to generate function declarations at runtime and the
 * domain functions remain the source of truth for validation.
 */
function tool<T extends z.ZodTypeAny>(
  name: string,
  description: string,
  parameters: T,
  execute: (input: z.infer<T>) => unknown,
): FunctionTool {
  return new FunctionTool({
    name,
    description,
    parameters: parameters as never,
    execute: execute as never,
  });
}

/**
 * Build the bounded ADK tools mapped to deterministic domain functions.
 *
 * `refine_session` needs the session store to resolve the prior session; the
 * other tools are pure domain functions.
 */
export function buildShopperTools(
  adapter: CatalogAdapter,
  sessionStore?: SessionStore,
): FunctionTool[] {
  return [
    tool(
      "inspect_native_results",
      "Inspect the native search results by product ID. Returns only products that exist in the catalog; never invents products.",
      NativeResultIdsSchema,
      async ({ nativeResultIds }) => {
        const products = [];
        for (const id of nativeResultIds) {
          const product = await adapter.getProduct(id);
          if (product) products.push(product);
        }
        return { products };
      },
    ),
    tool(
      "extract_constraints",
      "Extract shopper constraints (category, price_max, size, color, compatibility, intended_use) from a raw English query. Deterministic and LLM-free.",
      QuerySchema,
      ({ query }) => extractConstraints(query),
    ),
    tool(
      "search_catalog",
      "Search the catalog for products matching a query and optional hard constraints. Returns grounded candidates only; never invents products.",
      SearchCatalogSchema,
      async ({ query, constraints }) => {
        const results = await adapter.search(query, constraints);
        return toCatalogCandidates(results.map((r) => r.product));
      },
    ),
    tool(
      "validate_candidates",
      "Validate catalog candidates against shopper constraints. Returns valid candidates and rejected candidates with classifications.",
      ValidateCandidatesSchema,
      ({ candidates, constraints }) =>
        validateCandidates(candidates as CatalogCandidate[], constraints),
    ),
    tool(
      "prepare_decision_cards",
      "Build at most three grounded Decision Cards from validated candidates, ranked deterministically.",
      PrepareCardsSchema,
      ({ valid, constraints }) =>
        buildDecisionCards(valid as CandidateEvaluation[], constraints),
    ),
    tool(
      "refine_session",
      "Refine an existing recovery session with the shopper's follow-up response, producing an updated recovery decision.",
      RefineSessionSchema,
      async ({ sessionId, userResponse }) => {
        if (!sessionStore) {
          throw new Error("refine_session requires a session store");
        }
        const session = sessionStore.get(sessionId);
        if (!session) {
          throw new Error(`session ${sessionId} not found`);
        }
        return refineRecovery(adapter, session, userResponse);
      },
    ),
  ];
}

// ---------------------------------------------------------------------------
// ADK agent
// ---------------------------------------------------------------------------

const AGENT_INSTRUCTION = `You are the Recova shopper recovery agent. A shopper's native
search has failed or returned results that violate their constraints. Your job
is to produce a grounded RecoveryDecision.

Use the available tools in this order when evidence is needed:
1. extract_constraints to understand what the shopper asked for.
2. search_catalog to find grounded catalog candidates.
3. validate_candidates to enforce hard constraints.
4. prepare_decision_cards to build at most three Decision Cards.

Rules:
- Never invent products, variants, prices, availability, or catalog evidence.
- Every product/variant ID you emit must come from a tool result.
- Ask at most one targeted clarification at a time.
- Stop when no valid candidate exists; do not pad results.`;

/**
 * Build the ADK `LlmAgent` wired with Gemini 3.7 Flash and the bounded tools.
 */
export function buildShopperAgent(
  adapter: CatalogAdapter,
  sessionStore?: SessionStore,
): LlmAgent {
  return new LlmAgent({
    name: "shopper",
    description: "Recova shopper recovery agent",
    model: createAdkModel(),
    instruction: AGENT_INSTRUCTION,
    tools: buildShopperTools(adapter, sessionStore),
  });
}

// ---------------------------------------------------------------------------
// Convenience facade
// ---------------------------------------------------------------------------

/**
 * A single object bundling the adapter, LLM client, and ADK agent for a
 * merchant. The HTTP route layer uses `evaluate`/`refine`; the ADK agent is
 * the real-model orchestration path.
 */
export class ShopperAgent {
  readonly adapter: CatalogAdapter;
  readonly llm: GeminiClient;
  readonly adkAgent: LlmAgent;

  constructor(
    adapter: CatalogAdapter,
    options: GeminiClientOptions = {},
    sessionStore?: SessionStore,
  ) {
    this.adapter = adapter;
    this.llm = new GeminiClient(options);
    this.adkAgent = buildShopperAgent(adapter, sessionStore);
  }

  evaluate(input: EvaluateInput): Promise<RecoveryDecision> {
    return evaluateRecovery(this.adapter, input, this.llm);
  }

  refine(session: RecoverySession, userResponse: string): Promise<RecoveryDecision> {
    return refineRecovery(this.adapter, session, userResponse, this.llm);
  }
}
