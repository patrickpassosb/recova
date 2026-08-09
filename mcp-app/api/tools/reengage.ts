/**
 * T3 — reengage (P1, timeout de 30s)
 *
 * Quando o cliente não responde nem adiciona nada ao carrinho, o agente
 * espera 30 segundos e envia uma nova mensagem de pergunta.
 *
 * O chat NUNCA encerra sozinho (decisão da reunião 09/08): a conversa fica
 * aberta enquanto a aba estiver aberta. O reengage não tem limite de
 * tentativas nem estado "exhausted" — se a pessoa responder mais, o agente
 * continua. As mensagens ciclam para não soar repetitivo.
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { getSession, touchSession } from "../lib/sessions.ts";

export const REENGAGE_RESOURCE_URI = "ui://mcp-app/reengage";

export const reengageInputSchema = z.object({
  session_id: z.string().describe("ID da sessão criada pelo search_recovery"),
});

export type ReengageInput = z.infer<typeof reengageInputSchema>;

export const reengageOutputSchema = z.object({
  message: z.string().describe("Nova mensagem de pergunta para o cliente"),
  attempt: z
    .number()
    .int()
    .positive()
    .describe("Número da tentativa de reengajamento (sem limite — o chat nunca encerra)"),
  exhausted: z
    .boolean()
    .describe("Sempre false — o chat nunca encerra sozinho (decisão 09/08)"),
});

export type ReengageOutput = z.infer<typeof reengageOutputSchema>;

const REENGAGE_MESSAGES = [
  "Ei! Ainda está aí? 😊 Posso te ajudar a encontrar o produto ideal — me conta o que você procura?",
  "Só passando pra lembrar: encontrei opções que combinam com o que você buscava. Quer dar uma olhada?",
  "Continuo por aqui se quiser ajuda! 😉 Me diz o que você procura que eu te mostro as opções.",
];

export const reengageTool = (_env: Env) =>
  createTool({
    id: "reengage",
    description:
      "Reengajamento: após 30s sem ação do cliente, envia uma nova mensagem de pergunta. O chat nunca encerra sozinho — continua enquanto a aba estiver aberta.",
    inputSchema: reengageInputSchema,
    outputSchema: reengageOutputSchema,
    _meta: { ui: { resourceUri: REENGAGE_RESOURCE_URI } },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async ({ context }) => {
      const { session_id } = context as ReengageInput;
      const session = getSession(session_id);
      if (!session) {
        throw new Error(
          "Sessão não encontrada ou expirada. Chame search_recovery para iniciar uma nova conversa.",
        );
      }

      session.reengageAttempts += 1;
      touchSession(session.id);

      const attempt = session.reengageAttempts;
      // Cicla as mensagens para não soar repetitivo, sem nunca encerrar.
      const message = REENGAGE_MESSAGES[(attempt - 1) % REENGAGE_MESSAGES.length];

      return {
        message,
        attempt,
        exhausted: false,
      };
    },
  });
