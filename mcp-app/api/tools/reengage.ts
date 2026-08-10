/**
 * T3 — reengage (P1, timeout de 30s)
 *
 * Quando o cliente não responde nem adiciona nada ao carrinho, o agente
 * espera 60 segundos e envia uma nova mensagem de pergunta.
 *
 * Envia no máximo duas mensagens automáticas por sessão. A conversa continua
 * aberta depois disso, mas sem novos lembretes automáticos.
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { getSession, touchSession } from "../lib/sessions.ts";
import type { Env } from "../types/env.ts";

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
		.describe("Número da tentativa de reengajamento (máximo 2)"),
	exhausted: z
		.boolean()
		.describe("True após a segunda e última mensagem automática"),
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
			"Reengajamento: envia no máximo duas mensagens, uma por minuto de inatividade, sem encerrar o chat.",
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

			if (session.reengageAttempts >= REENGAGE_MESSAGES.length) {
				return {
					message: "",
					attempt: REENGAGE_MESSAGES.length,
					exhausted: true,
				};
			}

			session.reengageAttempts += 1;
			touchSession(session.id);

			const attempt = session.reengageAttempts;
			const message = REENGAGE_MESSAGES[attempt - 1];

			return {
				message,
				attempt,
				exhausted: attempt >= REENGAGE_MESSAGES.length,
			};
		},
	});
