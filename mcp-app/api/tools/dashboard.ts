/**
 * T5 — dashboard (Fase C — 100% dados reais)
 *
 * Agrega os eventos de instrumentação da Recova (brand book seções 74/75)
 * em métricas de negócio. Nenhum seed, nenhum badge, nenhum dado falso —
 * só eventos reais emitidos pelo overlay do demo-storefront e pelas tools.
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { getEvents, type RecovaEvent } from "../lib/events.ts";

export const DASHBOARD_RESOURCE_URI = "ui://mcp-app/dashboard";

export const dashboardInputSchema = z.object({
  // Sem input — o dashboard lê os eventos persistidos.
});

export type DashboardInput = z.infer<typeof dashboardInputSchema>;

export const dashboardOutputSchema = z.object({
  totals: z.object({
    searches: z.number(),
    zero_results: z.number(),
    low_relevance: z.number(),
    exposed: z.number(),
    product_views: z.number(),
    product_clicks: z.number(),
    refinements: z.number(),
    reengagements: z.number(),
    closes: z.number(),
    purchases: z.number(),
  }),
  metrics: z.object({
    /** % de buscas que retornaram zero resultados. */
    zero_results_rate: z.number(),
    /** % de sessões expostas que geraram compra atribuída. */
    recovery_rate: z.number(),
    /** Receita atribuída à Recova (soma dos preços das compras atribuídas). */
    attributed_revenue: z.number(),
    /** Receita por busca falha (atribuída / zero_results). */
    revenue_per_failed_search: z.number(),
    /** % de cliques em alternativas sobre produtos vistos. */
    click_through_rate: z.number(),
    /** % de refinamentos sobre sessões expostas. */
    refinement_rate: z.number(),
    /** % de reengajamentos sobre sessões expostas. */
    reengagement_rate: z.number(),
    /** Média de produtos vistos por usuário exposto. */
    products_per_user: z.number(),
    /** % de sessões expostas que iniciaram checkout (venda real vs carrinho abandonado). */
    checkout_rate: z.number(),
  }),
  recent: z.array(
    z.object({
      event: z.string(),
      timestamp: z.string(),
      session_id: z.string().optional(),
      query_hash: z.string().optional(),
      product_id: z.string().optional(),
      price: z.number().optional(),
    }),
  ),
});

export type DashboardOutput = z.infer<typeof dashboardOutputSchema>;

export const dashboardTool = (_env: Env) =>
  createTool({
    id: "dashboard",
    description:
      "Dashboard da Recova: agrega os eventos reais de instrumentação (buscas, zero-results, exposições, cliques, refinamentos, reengajamentos, compras atribuídas) em métricas de negócio. 100% dados reais, sem seed.",
    inputSchema: dashboardInputSchema,
    outputSchema: dashboardOutputSchema,
    _meta: { ui: { resourceUri: DASHBOARD_RESOURCE_URI } },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async () => {
      const events = getEvents();

      const count = (name: string) =>
        events.filter((e) => e.event === name).length;

      const searches = count("search_performed");
      const zeroResults = count("search_zero_results");
      const lowRelevance = count("search_low_relevance");
      const exposed = count("recova_exposed");
      const productViews = count("recova_product_viewed");
      const productClicks = count("recova_product_clicked");
      const refinements = count("recova_refinement_started");
      const reengagements = count("recova_reengaged");
      const closes = count("recova_closed");
      const purchases = count("purchase_attributed");

      // Receita atribuída: soma dos preços das compras atribuídas.
      const attributedRevenue = events
        .filter((e) => e.event === "purchase_attributed")
        .reduce((acc, e) => acc + (e.price ?? 0), 0);

      // Sessões expostas únicas (para taxas por sessão).
      const exposedSessions = new Set(
        events.filter((e) => e.event === "recova_exposed").map((e) => e.session_id),
      );
      const exposedCount = exposedSessions.size;

      // Compras atribuídas a sessões expostas (atribuição por sessão).
      const attributedPurchases = events.filter(
        (e) => e.event === "purchase_attributed" && e.exposed_session_id,
      ).length;

      const zeroResultsRate =
        searches > 0 ? Math.round((zeroResults / searches) * 1000) / 10 : 0;
      const recoveryRate =
        exposedCount > 0
          ? Math.round((attributedPurchases / exposedCount) * 1000) / 10
          : 0;
      const revenuePerFailedSearch =
        zeroResults > 0 ? Math.round((attributedRevenue / zeroResults) * 100) / 100 : 0;
      const clickThroughRate =
        productViews > 0
          ? Math.round((productClicks / productViews) * 1000) / 10
          : 0;
      const refinementRate =
        exposedCount > 0
          ? Math.round((refinements / exposedCount) * 1000) / 10
          : 0;
      const reengagementRate =
        exposedCount > 0
          ? Math.round((reengagements / exposedCount) * 1000) / 10
          : 0;

      // Média de produtos vistos por usuário exposto (pedido do Patrick).
      const productsPerUser =
        exposedCount > 0 ? Math.round((productViews / exposedCount) * 10) / 10 : 0;

      // Checkout iniciado (venda real) vs carrinho abandonado (pedido do Patrick).
      const checkouts = count("checkout_started");
      const checkoutRate =
        exposedCount > 0 ? Math.round((checkouts / exposedCount) * 1000) / 10 : 0;

      const recent = events
        .slice(-20)
        .reverse()
        .map((e: RecovaEvent) => ({
          event: e.event,
          timestamp: e.timestamp,
          session_id: e.session_id,
          query_hash: e.query_hash,
          product_id: e.product_id,
          price: e.price,
        }));

      return {
        totals: {
          searches,
          zero_results: zeroResults,
          low_relevance: lowRelevance,
          exposed,
          product_views: productViews,
          product_clicks: productClicks,
          refinements,
          reengagements,
          closes,
          purchases,
        },
        metrics: {
          zero_results_rate: zeroResultsRate,
          recovery_rate: recoveryRate,
          attributed_revenue: attributedRevenue,
          revenue_per_failed_search: revenuePerFailedSearch,
          click_through_rate: clickThroughRate,
          refinement_rate: refinementRate,
          reengagement_rate: reengagementRate,
          products_per_user: productsPerUser,
          checkout_rate: checkoutRate,
        },
        recent,
      };
    },
  });
