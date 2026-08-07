/**
 * Cliente LLM — DeepSeek V4 Flash via Aperture (tailnet da VPS).
 * Endpoint: http://ai.tail492ce8.ts.net/v1 (OpenAI-compatível, sem auth).
 *
 * Chamadas curtas (max_tokens ~500) e com timeout agressivo: o agente precisa
 * responder em <2s. Se o LLM falhar ou demorar, os callers usam fallback
 * lexical (ver tools).
 */

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const LLM_URL = "http://ai.tail492ce8.ts.net/v1/chat/completions";
const LLM_MODEL = "ollama-cloud/deepseek-v4-flash:0731";
const LLM_TIMEOUT_MS = 900;

export class LlmError extends Error {}

/** Chama o LLM e retorna o texto da resposta. Lança LlmError em falha/timeout. */
export async function chat(
  messages: LlmMessage[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const { maxTokens = 600, temperature = 0.3 } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(LLM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer not-required",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature,
        // Desliga o bloco de raciocínio do DeepSeek: sem isso o modelo gasta
        // todos os tokens em `reasoning` e o content sai vazio/truncado.
        think: false,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new LlmError(
      `LLM inacessível: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new LlmError(`LLM respondeu HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new LlmError("LLM retornou resposta vazia");

  return content.trim();
}

/** Extrai um JSON de uma resposta LLM (tolera markdown ```json ... ```). */
export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}
