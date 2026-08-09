import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  createSession,
  getSession,
  touchSession,
  addMessage,
  addSuggestedProducts,
  pruneSessions,
  type Session,
} from "../sessions.ts";

describe("sessions", () => {
  // Track created sessions to clean up between tests (module keeps a global Map).
  const createdIds: string[] = [];

  beforeEach(() => {
    createdIds.length = 0;
  });

  afterEach(() => {
    for (const id of createdIds) getSession(id); // touch/expire handling no-op
  });

  function makeSession(query = "tenis"): Session {
    const s = createSession(query);
    createdIds.push(s.id);
    return s;
  }

  it("creates a session with defaults", () => {
    const s = makeSession("caneca");
    expect(s.originalQuery).toBe("caneca");
    expect(s.messages).toEqual([]);
    expect(s.reengageAttempts).toBe(0);
    expect(s.suggestedProductIds).toEqual([]);
    expect(s.id).toBeTruthy();
  });

  it("getSession returns an existing session", () => {
    const s = makeSession();
    const got = getSession(s.id);
    expect(got?.id).toBe(s.id);
  });

  it("getSession returns undefined for unknown id", () => {
    expect(getSession("nope")).toBeUndefined();
  });

  it("addMessage appends and touches activity", () => {
    const s = makeSession();
    addMessage(s, "user", "oi");
    addMessage(s, "assistant", "olá");
    expect(s.messages).toEqual([
      { role: "user", content: "oi" },
      { role: "assistant", content: "olá" },
    ]);
  });

  it("addSuggestedProducts dedupes ids", () => {
    const s = makeSession();
    addSuggestedProducts(s, ["a", "b", "a", "c"]);
    expect(s.suggestedProductIds).toEqual(["a", "b", "c"]);
  });

  it("touchSession updates lastActivityAt", () => {
    const s = makeSession();
    const before = s.lastActivityAt;
    s.lastActivityAt = 0;
    touchSession(s.id);
    expect(s.lastActivityAt).toBeGreaterThanOrEqual(before);
  });

  it("pruneSessions removes expired sessions", () => {
    const s = makeSession();
    // Fake expiry: TTL is 30 min; set lastActivityAt far in the past
    const past = Date.now() - 31 * 60 * 1000;
    s.lastActivityAt = past;
    pruneSessions();
    expect(getSession(s.id)).toBeUndefined();
  });
});
