import { createHash } from "node:crypto";
import { FinishReason, GoogleGenAI, type Content } from "@google/genai";
import {
  BaseLlm,
  Gemini as AdkGemini,
  type LlmRequest,
  type LlmResponse,
} from "@google/adk";
import type { z } from "zod";

/**
 * Gemini LLM layer (docs/PLAN_FINAL.md §6 "Local determinism").
 *
 * A thin client over the Gemini Developer API (`@google/genai`) that honors
 * environment configuration at RUNTIME:
 *
 *   - `GEMINI_MODEL`  — model name (default `gemini-3.7-flash`).
 *   - `GEMINI_API_KEY` — Gemini Developer API key (never hardcoded).
 *   - `STUB_GEMINI`   — when `"true"`, returns deterministic canned structured
 *     outputs from fixtures and never touches the network.
 *
 * A tiny in-memory cache keyed on a SHA-256 hash of the prompt avoids repeated
 * model calls for identical prompts within a process lifetime.
 */

export const DEFAULT_GEMINI_MODEL = "gemini-3.7-flash";

/** Whether stub mode is enabled via the environment. */
export function isStubMode(): boolean {
  return process.env.STUB_GEMINI === "true";
}

/** Resolve the configured model name (default `gemini-3.7-flash`). */
export function resolveModel(): string {
  return process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
}

/** SHA-256 hash of a prompt, used as the in-memory cache key. */
export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

/**
 * Canned structured outputs used in stub mode, keyed by a stable task name.
 * These are deterministic fixtures — no network, no randomness.
 */
export const STUB_FIXTURES: Record<string, unknown> = {
  // Natural-language clarification prompt for CLARIFY decisions.
  "refinement-prompt":
    "Could you tell me more about what you're looking for?",
};

/** Deterministic canned text for a task, falling back to a stable default. */
function stubText(task?: string): string {
  if (task && task in STUB_FIXTURES) return String(STUB_FIXTURES[task]);
  return "stub";
}

export interface GeminiClientOptions {
  model?: string;
  apiKey?: string;
  stub?: boolean;
}

/**
 * A minimal Gemini client with stub mode and an in-memory prompt cache.
 *
 * The API key is read from `GEMINI_API_KEY` at construction time (runtime),
 * never hardcoded. When `STUB_GEMINI=true` (or `stub: true`), no `GoogleGenAI`
 * client is created and no network call is made.
 */
export class GeminiClient {
  readonly model: string;
  readonly stub: boolean;
  private readonly apiKey?: string;
  private readonly ai?: GoogleGenAI;
  private readonly cache = new Map<string, unknown>();

  constructor(options: GeminiClientOptions = {}) {
    this.model = options.model ?? resolveModel();
    this.stub = options.stub ?? isStubMode();
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    if (!this.stub) {
      if (!this.apiKey) {
        throw new Error(
          "GEMINI_API_KEY is required when STUB_GEMINI is not enabled",
        );
      }
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    }
  }

  /** Generate plain text for a prompt (cached on prompt hash). */
  async generateText(prompt: string, task?: string): Promise<string> {
    const key = hashPrompt(prompt);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached as string;

    const out = this.stub
      ? stubText(task)
      : await this.callText(prompt);
    this.cache.set(key, out);
    return out;
  }

  /** Generate a Zod-validated structured output for a prompt (cached). */
  async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    task?: string,
  ): Promise<T> {
    const key = hashPrompt(prompt);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached as T;

    const raw = this.stub
      ? stubText(task)
      : await this.callText(prompt);
    const parsed = schema.parse(raw);
    this.cache.set(key, parsed);
    return parsed;
  }

  private async callText(prompt: string): Promise<string> {
    const response = await this.ai!.models.generateContent({
      model: this.model,
      contents: prompt,
    });
    return response.text ?? "";
  }
}

/**
 * A deterministic `BaseLlm` used by the ADK agent in stub mode. It yields a
 * single canned text response and never performs a network call.
 */
class StubLlm extends BaseLlm {
  constructor(model: string) {
    super({ model });
  }

  async *generateContentAsync(
    _llmRequest: LlmRequest,
    _stream?: boolean,
    _abortSignal?: AbortSignal,
  ): AsyncGenerator<LlmResponse, void> {
    const content: Content = {
      role: "model",
      parts: [{ text: stubText() }],
    };
    yield { content, finishReason: FinishReason.STOP };
  }

  async connect(_llmRequest: LlmRequest): Promise<never> {
    throw new Error("StubLlm does not support live connections");
  }
}

/**
 * Build the ADK `BaseLlm` for the shopper agent, honoring the same environment
 * configuration as `GeminiClient`. In stub mode this returns a deterministic
 * `StubLlm`; otherwise it returns the ADK `Gemini` model wired to the Gemini
 * Developer API.
 */
export function createAdkModel(): BaseLlm {
  const model = resolveModel();
  if (isStubMode()) return new StubLlm(model);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is required when STUB_GEMINI is not enabled",
    );
  }
  return new AdkGemini({ model, apiKey });
}
