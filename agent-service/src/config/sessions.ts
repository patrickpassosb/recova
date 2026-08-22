import type { RecoveryDecision } from "../domain/schemas.js";

/**
 * Session store interface (docs/PLAN_FINAL.md §7, W07).
 *
 * Sessions are scoped by `storeId` and `sessionId` for tenant isolation. This
 * module defines the portable interface plus a trivial in-memory implementation
 * for the Day-3 vertical slice; Firestore lands on Day 4 (W07) behind the same
 * interface.
 */

/** The recovery context persisted for a session. */
export interface RecoverySession {
  sessionId: string;
  storeId: string;
  query: string;
  nativeResultIds: string[];
  decision: RecoveryDecision;
}

/** Portable session persistence seam. */
export interface SessionStore {
  get(sessionId: string): RecoverySession | null;
  set(session: RecoverySession): void;
  delete(sessionId: string): void;
}

/** Trivial in-memory session store (single process, not durable). */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, RecoverySession>();

  get(sessionId: string): RecoverySession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  set(session: RecoverySession): void {
    this.sessions.set(session.sessionId, session);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
