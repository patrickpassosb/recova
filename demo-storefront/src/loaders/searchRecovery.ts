/**
 * Loader do Search Recovery Agent (V2).
 *
 * Roda server-side e faz proxy para o agent-service V2
 * (`{AGENT_URL}/v1/recovery/evaluate` e `/v1/recovery/refine`), o mesmo
 * backend do `recoveryGateway` usado pela página `/s`. O browser não acessa
 * o agente diretamente — chama este loader via `invoke.site.loaders.searchRecovery`.
 *
 * Mapeia o `RecoveryDecision` do V2 para o shape histórico `RecoveryResult`
 * consumido pelo `SearchRecoveryOverlay` (modal de busca).
 *
 * Sem equivalente V2 (retornam null, tratados como no-op pelo overlay):
 * `reengage`, `analyze`, `dashboard`, `track_event`.
 */

export interface RecoveryProduct {
  id: string;
  title: string;
  /** Handle do produto — para linkar à página do produto (/products/:slug). */
  handle?: string | null;
  /** Descrição em texto puro cadastrada no Shopify. */
  description?: string | null;
  price: number;
  image: string | null;
  score: number;
  match_type: "MATCH" | "PARTIAL";
  /** MerchantId da variante — usado para adicionar ao carrinho real. */
  variant_id?: string | null;
}

export interface RecoveryResult {
  session_id: string;
  products: RecoveryProduct[];
  explanation: string;
  follow_up_question: string;
  /** Chips de refinamento dinâmicos vindos do backend (opcional). */
  refinement_options?: string[];
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

export interface DashboardResult {
  totals: Record<string, number>;
  metrics: Record<string, number>;
  recent: Array<Record<string, unknown>>;
}

export interface TrackEventResult {
  ok: boolean;
  event: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// V2 agent client
// ---------------------------------------------------------------------------

const DEFAULT_AGENT_URL = "http://localhost:8080";
const REQUEST_TIMEOUT_MS = 10_000;

interface DecisionCardDto {
  productId: string;
  variantId: string;
  handle: string;
  title: string;
  imageUrl: string | null;
  price: number;
  available: boolean;
  matchScore: number;
  reason: string;
}

interface RecoveryDecisionDto {
  sessionId: string;
  route: "NATIVE_OK" | "RECOVER" | "CLARIFY";
  cards: DecisionCardDto[];
  refinementPrompt: string | null;
  refinementOptions: string[];
}

/** Resolve the agent base URL from `AGENT_URL`, defaulting to localhost. */
function agentUrl(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env?.AGENT_URL?.trim() || DEFAULT_AGENT_URL;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Minimal boundary guard: only trust fields we actually read. */
function parseDecision(value: unknown): RecoveryDecisionDto | null {
  if (!isRecord(value)) return null;
  if (typeof value.sessionId !== "string") return null;
  if (value.route !== "NATIVE_OK" && value.route !== "RECOVER" && value.route !== "CLARIFY") {
    return null;
  }
  if (!Array.isArray(value.cards)) return null;
  if (value.refinementPrompt !== null && typeof value.refinementPrompt !== "string") return null;
  if (!Array.isArray(value.refinementOptions)) return null;
  return value as unknown as RecoveryDecisionDto;
}

/** Mapeia o RecoveryDecision do V2 para o shape consumido pelo overlay. */
function toRecoveryResult(decision: RecoveryDecisionDto): RecoveryResult | null {
  if (decision.route === "NATIVE_OK") return null;

  const products: RecoveryProduct[] = decision.cards.map((card) => ({
    id: card.productId,
    title: card.title,
    handle: card.handle ?? null,
    description: null,
    price: card.price,
    image: card.imageUrl ?? null,
    score: card.matchScore,
    match_type: "MATCH",
    variant_id: card.variantId,
  }));

  if (decision.route === "CLARIFY") {
    return {
      session_id: decision.sessionId,
      products: [],
      explanation: decision.refinementPrompt ??
        "Não consegui identificar exatamente o que você procura. Pode me dar mais detalhes?",
      follow_up_question: "",
      refinement_options: decision.refinementOptions,
    };
  }

  // RECOVER
  return {
    session_id: decision.sessionId,
    products,
    explanation: "Separei algumas opções do catálogo que podem atender ao que você procura.",
    follow_up_question: "Quer que eu refine por preço, tamanho ou estilo?",
    refinement_options: decision.refinementOptions,
  };
}

async function postDecision(
  path: "/v1/recovery/evaluate" | "/v1/recovery/refine",
  body: Record<string, unknown>,
): Promise<RecoveryDecisionDto | null> {
  const res = await fetch(`${agentUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return parseDecision(await res.json());
}

export interface Props {
  /** Termo digitado na busca */
  query?: string;
  /** ID de sessão para continuar a conversa */
  session_id?: string;
  /** Resposta do cliente (para converse) */
  user_response?: string;
  /** Ação: search_recovery | converse | reengage | analyze | dashboard | track_event */
  action?: "search_recovery" | "converse" | "reengage" | "analyze" | "dashboard" | "track_event";
  /** Payload do evento (para track_event) */
  event?: Record<string, unknown>;
}

export default async function searchRecoveryLoader({
  query,
  session_id,
  user_response,
  action = "search_recovery",
}: Props): Promise<
  RecoveryResult | ReengageResult | AnalyzeResult | DashboardResult | TrackEventResult | null
> {
  if (!query && action === "search_recovery") return null;

  try {
    switch (action) {
      case "converse": {
        if (!session_id || !user_response) return null;
        const decision = await postDecision("/v1/recovery/refine", {
          sessionId: session_id,
          userResponse: user_response,
        });
        return decision ? toRecoveryResult(decision) : null;
      }
      case "search_recovery": {
        const decision = await postDecision("/v1/recovery/evaluate", {
          storeId: "demo",
          query,
          nativeResultIds: [],
        });
        return decision ? toRecoveryResult(decision) : null;
      }
      // Sem equivalente no agent-service V2 — no-op (o overlay trata null
      // como "sem resultado" sem quebrar o fluxo).
      case "reengage":
      case "analyze":
      case "dashboard":
      case "track_event":
      default:
        return null;
    }
  } catch (err) {
    console.error("[searchRecoveryLoader]", err);
    return null;
  }
}
