/**
 * Loader proxy do Search Recovery Agent.
 *
 * Roda server-side (no dev server / worker) e faz proxy para o MCP server
 * do agente (`http://localhost:3001/api/mcp` na VPS). O browser não acessa
 * o MCP diretamente — chama este loader via `invoke.site.loaders.searchRecovery`.
 *
 * Expõe as 4 tools do agente: search_recovery, converse, reengage e
 * analyze_zero_results.
 */

export interface RecoveryProduct {
  id: string;
  title: string;
  price: number;
  image: string | null;
  score: number;
  match_type: "MATCH" | "PARTIAL";
}

export interface RecoveryResult {
  session_id: string;
  products: RecoveryProduct[];
  explanation: string;
  follow_up_question: string;
}

export interface ReengageResult {
  message: string;
  attempt: 1 | 2;
  exhausted: boolean;
}

export interface AnalyzeResult {
  report: Array<{
    term: string;
    volume: number;
    cause: "typo" | "sinonimo" | "nao_catalogado" | "regionalismo";
    suggested_fix: string;
  }>;
  summary: string;
}

const MCP_URL = "http://localhost:3001/api/mcp";

async function callTool<T>(name: string, arguments_: Record<string, unknown>): Promise<T> {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name, arguments: arguments_ },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`MCP server respondeu HTTP ${res.status}`);
  }

  const text = await res.text();
  // Resposta SSE: linhas "data: {json}"
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) continue;
    const payload = JSON.parse(trimmed.slice(6)) as {
      result?: { structuredContent?: T; content?: Array<{ type: string; text?: string }> };
      error?: { message?: string };
    };
    if (payload.error) {
      throw new Error(payload.error.message ?? "Erro no MCP server");
    }
    const structured = payload.result?.structuredContent;
    if (structured) return structured;
    // fallback: parseia o texto JSON do content
    const textBlock = payload.result?.content?.find((c) => c.type === "text");
    if (textBlock?.text) {
      try {
        return JSON.parse(textBlock.text) as T;
      } catch {
        // não é JSON — segue
      }
    }
  }
  throw new Error("MCP server não retornou resultado");
}

export interface Props {
  /** Termo digitado na busca */
  query?: string;
  /** ID de sessão para continuar a conversa */
  session_id?: string;
  /** Resposta do cliente (para converse) */
  user_response?: string;
  /** Ação: search_recovery | converse | reengage | analyze */
  action?: "search_recovery" | "converse" | "reengage" | "analyze";
}

export default async function searchRecoveryLoader({
  query,
  session_id,
  user_response,
  action = "search_recovery",
}: Props): Promise<RecoveryResult | ReengageResult | AnalyzeResult | null> {
  if (!query && action === "search_recovery") return null;

  try {
    switch (action) {
      case "converse":
        if (!session_id || !user_response) return null;
        return await callTool<RecoveryResult>("converse", {
          session_id,
          user_response,
        });
      case "reengage":
        if (!session_id) return null;
        return await callTool<ReengageResult>("reengage", { session_id });
      case "analyze":
        return await callTool<AnalyzeResult>("analyze_zero_results", {});
      case "search_recovery":
      default:
        return await callTool<RecoveryResult>("search_recovery", { query });
    }
  } catch (err) {
    console.error("[searchRecoveryLoader]", err);
    return null;
  }
}
