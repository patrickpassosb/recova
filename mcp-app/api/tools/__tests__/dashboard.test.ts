import { describe, it, expect, afterEach } from "bun:test";
import { dashboardTool } from "../dashboard.ts";
import { trackEventTool } from "../trackEvent.ts";
import { clearEvents } from "../../lib/events.ts";

/**
 * Integration tests for T5 (dashboard) e T6 (track_event) — Fase C.
 *
 * Verifica que track_event persiste eventos reais e que o dashboard os
 * agrega em métricas (sem seed, sem badge).
 */
describe("dashboard + track_event", () => {
  afterEach(() => {
    clearEvents();
  });

  const track = trackEventTool({} as never);
  const dashboard = dashboardTool({} as never);

  function runTrack(event: {
    event: "search_performed" | "search_zero_results" | "search_low_relevance" | "recova_exposed" | "recova_product_viewed" | "recova_product_clicked" | "recova_refinement_started" | "recova_reengaged" | "recova_closed" | "purchase_attributed";
    session_id?: string;
    query_hash?: string;
    trigger?: "zero_results" | "low_relevance";
    interaction_type?: "product_click" | "refinement" | "close" | "reengagement";
    products_shown?: number;
    product_id?: string;
    price?: number;
    exposed_session_id?: string;
  }) {
    return track.execute({
      context: event,
      runtimeContext: {} as never,
    }) as Promise<{ ok: boolean; event: string }>;
  }

  function runDashboard() {
    return dashboard.execute({
      context: {},
      runtimeContext: {} as never,
    }) as Promise<{
      totals: Record<string, number>;
      metrics: Record<string, number>;
      recent: Array<Record<string, unknown>>;
    }>;
  }

  it("tracks an event and returns ok", async () => {
    const res = await runTrack({
      event: "recova_exposed",
      session_id: "sess-1",
      query_hash: "abc",
      trigger: "zero_results",
      products_shown: 3,
    });
    expect(res.ok).toBe(true);
    expect(res.event).toBe("recova_exposed");
  });

  it("aggregates real events into dashboard metrics", async () => {
    // Simula um fluxo real: busca zero-results → exposição → clique → compra.
    await runTrack({ event: "search_performed", session_id: "s1" });
    await runTrack({ event: "search_zero_results", session_id: "s1" });
    await runTrack({
      event: "recova_exposed",
      session_id: "s1",
      query_hash: "abc",
      trigger: "zero_results",
      products_shown: 3,
    });
    await runTrack({
      event: "recova_product_viewed",
      session_id: "s1",
      product_id: "p1",
      price: 120,
    });
    await runTrack({
      event: "recova_product_clicked",
      session_id: "s1",
      interaction_type: "product_click",
      product_id: "p1",
      price: 120,
    });
    await runTrack({
      event: "purchase_attributed",
      session_id: "s1",
      exposed_session_id: "s1",
      product_id: "p1",
      price: 120,
    });

    const res = await runDashboard();
    expect(res.totals.searches).toBe(1);
    expect(res.totals.zero_results).toBe(1);
    expect(res.totals.exposed).toBe(1);
    expect(res.totals.product_clicks).toBe(1);
    expect(res.totals.purchases).toBe(1);
    expect(res.metrics.zero_results_rate).toBe(100);
    expect(res.metrics.recovery_rate).toBe(100);
    expect(res.metrics.attributed_revenue).toBe(120);
    expect(res.recent.length).toBeGreaterThan(0);
  });

  it("returns zeroed metrics when there are no events", async () => {
    const res = await runDashboard();
    expect(res.totals.searches).toBe(0);
    expect(res.metrics.attributed_revenue).toBe(0);
    expect(res.recent.length).toBe(0);
  });
});
