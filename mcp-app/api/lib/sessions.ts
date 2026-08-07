/**
 * Sessões de conversa do Search Recovery Agent (em memória).
 *
 * Cada sessão guarda o histórico da conversa (para o `converse` manter
 * contexto entre iterações) e o estado do loop de reengajamento (para o
 * `reengage` respeitar o máximo de 2 tentativas, sem spam).
 */

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Session {
  id: string;
  /** Termo original da busca que falhou */
  originalQuery: string;
  /** Histórico da conversa (contexto para o LLM) */
  messages: SessionMessage[];
  /** Tentativas de reengajamento já enviadas (máx 2) */
  reengageAttempts: number;
  /** Timestamp da última atividade (para o timeout de 30s) */
  lastActivityAt: number;
  /** Produtos já sugeridos (para não repetir nas próximas iterações) */
  suggestedProductIds: string[];
  createdAt: number;
}

const SESSIONS_TTL_MS = 30 * 60_000;
const sessions = new Map<string, Session>();

export function createSession(originalQuery: string): Session {
  const now = Date.now();
  const session: Session = {
    id: crypto.randomUUID(),
    originalQuery,
    messages: [],
    reengageAttempts: 0,
    lastActivityAt: now,
    suggestedProductIds: [],
    createdAt: now,
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  if (Date.now() - session.lastActivityAt > SESSIONS_TTL_MS) {
    sessions.delete(id);
    return undefined;
  }
  return session;
}

export function touchSession(id: string): void {
  const session = sessions.get(id);
  if (session) session.lastActivityAt = Date.now();
}

export function addMessage(session: Session, role: "user" | "assistant", content: string): void {
  session.messages.push({ role, content });
  session.lastActivityAt = Date.now();
}

export function addSuggestedProducts(session: Session, productIds: string[]): void {
  for (const id of productIds) {
    if (!session.suggestedProductIds.includes(id)) {
      session.suggestedProductIds.push(id);
    }
  }
}

/** Limpa sessões expiradas (chamado a cada nova sessão). */
export function pruneSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivityAt > SESSIONS_TTL_MS) sessions.delete(id);
  }
}
