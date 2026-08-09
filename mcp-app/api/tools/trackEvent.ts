/**
 * T6 — track_event (Fase C — instrumentação)
 *
 * Recebe um evento real de instrumentação do overlay do demo-storefront e o
 * persiste (arquivo JSON). O dashboard agrega esses eventos em métricas.
 * Nenhum seed, nenhum badge — só eventos reais.
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { trackEvent, type RecovaEventName } from "../lib/events.ts";

export const TRACK_EVENT_RESOURCE_URI = "ui://mcp-app/track-event";

const EVENT_NAMES = [
  "search_performed",
  "search_zero_results",
  "search_low_relevance",
  "recova_exposed",
  "recova_product_viewed",
  "recova_product_clicked",
  "recova_refinement_started",
  "recova_reengaged",
  "recova_closed",
  "purchase_attributed",
  "checkout_started",
] as const;

export const trackEventInputSchema = z.object({
  event: z.enum(EVENT_NAMES).describe("Nome do evento (brand book seção 74)"),
  store_id: z.string().optional().describe("Identificador da loja"),
  query_hash: z.string().optional().describe("Hash da busca (schema seção 69)"),
  trigger: z.enum(["zero_results", "low_relevance"]).optional().describe("Gatilho da exposição"),
  session_id: z.string().optional().describe("ID da sessão"),
  interaction_type: z
    .enum(["product_click", "refinement", "close", "reengagement"])
    .optional()
    .describe("Tipo de interação (schema seção 69)"),
  products_shown: z.number().int().optional().describe("Quantos produtos foram mostrados"),
  product_id: z.string().optional().describe("ID do produto (clique/compra)"),
  price: z.number().optional().describe("Preço do produto (para receita atribuída)"),
  exposed_session_id: z.string().optional().describe("Sessão exposta que gerou a compra (atribuição)"),
});

export type TrackEventInput = z.infer<typeof trackEventInputSchema>;

export const trackEventOutputSchema = z.object({
  ok: z.boolean(),
  event: z.string(),
  timestamp: z.string(),
});

export type TrackEventOutput = z.infer<typeof trackEventOutputSchema>;

export const trackEventTool = (_env: Env) =>
  createTool({
    id: "track_event",
    description:
      "Registra um evento real de instrumentação da Recova (busca, zero-results, exposição, clique, refinamento, reengajamento, fechamento, compra atribuída). Os eventos alimentam o dashboard.",
    inputSchema: trackEventInputSchema,
    outputSchema: trackEventOutputSchema,
    _meta: { ui: { resourceUri: TRACK_EVENT_RESOURCE_URI } },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async ({ context }) => {
      const input = context as TrackEventInput;
      const timestamp = new Date().toISOString();
      trackEvent({
        event: input.event as RecovaEventName,
        timestamp,
        store_id: input.store_id,
        query_hash: input.query_hash,
        trigger: input.trigger,
        session_id: input.session_id,
        interaction_type: input.interaction_type,
        products_shown: input.products_shown,
        product_id: input.product_id,
        price: input.price,
        exposed_session_id: input.exposed_session_id,
      });
      return { ok: true, event: input.event, timestamp };
    },
  });
