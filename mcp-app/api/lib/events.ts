/**
 * Eventos de instrumentação da Recova (Fase C — dashboard 100% dados reais).
 *
 * Persistência: arquivo JSON em disco (sobrevive ao restart do mcp-app) com
 * cache em memória. Para o MVP do hackathon, um append em arquivo JSON é
 * simples, legível e suficiente — sem banco externo. O arquivo fica em
 * `mcp-app/data/events.json` (gitignored via `data/`).
 *
 * Eventos mínimos (brand book seção 74):
 *   search_performed, search_zero_results, search_low_relevance,
 *   recova_exposed, recova_product_viewed, recova_product_clicked,
 *   recova_refinement_started, recova_reengaged, recova_closed,
 *   purchase_attributed
 *
 * Schemas (brand book seção 69):
 *   recova_exposed: { store_id, query_hash, trigger, timestamp, session_id }
 *   recova_interaction: { interaction_type: product_click|refinement|close|reengagement, products_shown, timestamp }
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export type RecovaEventName =
  | "search_performed"
  | "search_zero_results"
  | "search_low_relevance"
  | "recova_exposed"
  | "recova_product_viewed"
  | "recova_product_clicked"
  | "recova_refinement_started"
  | "recova_reengaged"
  | "recova_closed"
  | "purchase_attributed"
  | "checkout_started";

export interface RecovaEvent {
  event: RecovaEventName;
  timestamp: string; // ISO-8601
  store_id?: string;
  query_hash?: string;
  trigger?: "zero_results" | "low_relevance";
  session_id?: string;
  interaction_type?: "product_click" | "refinement" | "close" | "reengagement";
  products_shown?: number;
  product_id?: string;
  price?: number;
  /** Sessão exposta que gerou a compra (para atribuição). */
  exposed_session_id?: string;
}

const DATA_DIR = join(process.cwd(), "data");
const EVENTS_FILE = join(DATA_DIR, "events.json");

/** Cache em memória (evita ler o disco a cada evento). */
let cache: RecovaEvent[] | null = null;

function load(): RecovaEvent[] {
  if (cache) return cache;
  try {
    if (existsSync(EVENTS_FILE)) {
      const raw = readFileSync(EVENTS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      cache = Array.isArray(parsed) ? parsed : [];
    } else {
      cache = [];
    }
  } catch {
    cache = [];
  }
  return cache;
}

function persist(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(EVENTS_FILE, JSON.stringify(cache ?? [], null, 2), "utf-8");
  } catch (err) {
    console.warn(`[events] falha ao persistir: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Registra um evento real. */
export function trackEvent(event: RecovaEvent): void {
  const events = load();
  events.push(event);
  persist();
}

/** Retorna todos os eventos registrados (para o dashboard). */
export function getEvents(): RecovaEvent[] {
  return load();
}

/** Limpa todos os eventos (usado em testes). */
export function clearEvents(): void {
  cache = [];
  persist();
}

/** Hash simples de uma query (para o query_hash do schema). */
export function hashQuery(query: string): string {
  let h = 0;
  for (let i = 0; i < query.length; i++) {
    h = (h * 31 + query.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}
