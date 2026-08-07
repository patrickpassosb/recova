/**
 * T3 — reengage (P1, timeout de 30s)
 *
 * Quando o cliente não responde nem adiciona nada ao carrinho, o agente
 * espera 30 segundos e envia uma nova mensagem de pergunta. Máximo de 2
 * tentativas (sem spam) e mensagem diferente a cada tentativa.
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
    .union([z.literal(1), z.literal(2)])
    .describe("Número da tentativa de reengajamento (máx 2)"),
  exhausted: z
    .boolean()
    .describe("true quando o limite de 2 tentativas foi atingido (estado ❌)"),
});

export type ReengageOutput = z.infer<typeof reengageOutputSchema>;

const REENGAGE_MESSAGES = [
  "Ei! Ainda está aí? 😊 Posso te ajudar a encontrar o produto ideal — me conta o que você procura?",
  "Só passando pra lembrar: encontrei opções que combinam com o que você buscava. Quer dar uma olhada?",
];

export const reengageTool = (_env: Env) =>
  createTool({
    id: "reengage",
    description:
      "Reengajamento: após 30s sem ação do cliente, envia uma nova mensagem de pergunta (máx 2 tentativas, sem spam).",
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

      if (session.reengageAttempts >= 2) {
        return {
          message:
            "Não recebemos resposta. Se quiser continuar, é só chamar a gente! 👋",
          attempt: 2 as const,
          exhausted: true,
        };
      }

      session.reengageAttempts += 1;
      touchSession(session.id);

      const attempt = session.reengageAttempts as 1 | 2;
      const message = REENGAGE_MESSAGES[attempt - 1];

      return {
        message,
        attempt,
        exhausted: false,
      };
    },
  });
