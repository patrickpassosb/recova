/**
 * Cliente LLM — DeepSeek V4 Flash via API oficial do Ollama Cloud.
 * Endpoint: https://ollama.com/v1/chat/completions (OpenAI-compatível).
 * Auth: Bearer OLLAMA_API_KEY (variável de ambiente, ver .env).
 *
 * Chamadas curtas (max_tokens ~500) e com timeout agressivo: o agente precisa
 * responder em <2s. Se o LLM falhar ou demorar, os callers usam fallback
 * lexical (ver tools).
 */

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Configuração do LLM, 100% via variáveis de ambiente (reversível):
 *
 * Ordem de precedência (primeiro que estiver setado vence):
 *   1. `OLLAMA_API_KEY`  → `https://ollama.com/v1/chat/completions`, `deepseek-v4-flash:preview`
 *   2. `OPENAI_API_KEY`  → usa `OPENAI_BASE_URL` (default `https://api.openai.com/v1`) e `OPENAI_MODEL`
 *
 * Na VPS de dev, o padrão é o proxy Tailscale (`OPENAI_BASE_URL` + `OPENAI_API_KEY` +
 * `OPENAI_MODEL=ollama-cloud/deepseek-v4-flash`). Se nenhuma chave existir, o agente
 * opera 100% em fallback lexical (tools ainda funcionam, sem LLM).
 */
const OLLAMA_URL = "https://ollama.com/v1/chat/completions";
const OLLAMA_MODEL = "deepseek-v4-flash:preview";
const OPENAI_DEFAULT_URL = "https://api.openai.com/v1";

const LLM_API_KEY = process.env.OLLAMA_API_KEY || process.env.OPENAI_API_KEY || "";
const LLM_URL = process.env.OLLAMA_API_KEY
  ? OLLAMA_URL
  : `${(process.env.OPENAI_BASE_URL || OPENAI_DEFAULT_URL).replace(/\/+$/, "")}/chat/completions`;
const LLM_MODEL =
  process.env.OLLAMA_API_KEY ? OLLAMA_MODEL : (process.env.OPENAI_MODEL || "gpt-4o-mini");
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 3000;

export class LlmError extends Error {}

/** Chama o LLM e retorna o texto da resposta. Lança LlmError em falha/timeout. */
export async function chat(
  messages: LlmMessage[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const { maxTokens = 600, temperature = 0.3 } = opts;

  if (!LLM_API_KEY) {
    throw new LlmError("OLLAMA_API_KEY não configurada (ver mcp-app/.env)");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(LLM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature,
        // Desliga o bloco de raciocínio do DeepSeek: sem isso o modelo gasta
        // todos os tokens em `reasoning` e o content sai vazio/truncado.
        reasoning_effort: "none",
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
