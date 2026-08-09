/**
 * T2 — converse (P0, loop da conversa)
 *
 * Interpreta a resposta do cliente, refina a busca (novos filtros/sinônimos)
 * e devolve 3+ produtos relevantes + explicação + nova pergunta. O contexto da
 * sessão (histórico) é preservado entre iterações.
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { chat, extractJson, LlmError } from "../lib/llm.ts";
import {
  extractMaxPrice,
  fetchCatalog,
  isStopword,
  lexicalSearch,
  normalize,
  popularProducts,
  toProductOutput,
  type CatalogProduct,
  type ScoredProduct,
} from "../lib/shopify.ts";
import {
  addMessage,
  addSuggestedProducts,
  getSession,
  touchSession,
} from "../lib/sessions.ts";
import { SEARCH_RECOVERY_RESOURCE_URI } from "./searchRecovery.ts";

export const CONVERSE_RESOURCE_URI = "ui://mcp-app/converse";

export const converseInputSchema = z.object({
  session_id: z.string().describe("ID da sessão criada pelo search_recovery"),
  user_response: z
    .string()
    .min(1)
    .max(500)
    .refine((r) => r.trim().length > 0, { message: "Resposta não pode ser vazia" })
    .describe("Resposta livre do cliente à pergunta do agente"),
});

export type ConverseInput = z.infer<typeof converseInputSchema>;

export const converseOutputSchema = z.object({
  session_id: z.string(),
  products: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        price: z.number(),
        image: z.string().nullable(),
        score: z.number(),
        match_type: z.enum(["MATCH", "PARTIAL"]),
        variant_id: z.string().nullable().optional().describe("MerchantId para adicionar ao carrinho"),
      }),
    )
    .describe("3+ produtos relevantes à resposta do cliente"),
  explanation: z.string().describe("Explicação do porquê estes produtos foram escolhidos"),
  follow_up_question: z.string().describe("Nova pergunta de refinamento (loop)"),
});

export type ConverseOutput = z.infer<typeof converseOutputSchema>;

const REFINE_SYSTEM_PROMPT = [
  "Você é o agente de recuperação de busca de uma loja de e-commerce.",
  "O catálogo da loja tem estes tipos de produto: sticker, t-shirt, tee, hoodie, sweatshirt, raglan hoodie, bomber jacket, rain jacket, mug, tumbler, bottle, water bottle, backpack, tote bag, hat, bucket hat, winter hat, notebook, pen, pillow, snap case, flip flops, slides, canvas shoes, sneakers, shorts.",
  "O cliente respondeu a uma pergunta de refinamento. Entenda a resposta e responda APENAS com JSON:",
  '{"terms": ["termos de busca em INGLÊS, separados"], "max_price": número ou null, "sort_by_price": "asc" | "desc" | null}',
  "Regras:",
  "- terms: 2 a 6 termos em inglês que casem com os tipos de produto acima.",
  "- Se a resposta menciona preço numérico ('até 100', 'até R$ 50'), coloque o número em max_price.",
  "- Se a resposta pede o mais barato/baratinho ('mais barato', 'baratinho', 'mais em conta', 'quero o mais barato'), use sort_by_price: 'asc'.",
  "- Se a resposta pede o mais caro/premium, use sort_by_price: 'desc'.",
  "- NÃO invente produtos. Só devolva o JSON.",
].join("\n");

interface RefineIntent {
  terms: string[];
  max_price: number | null;
  sort_by_price?: "asc" | "desc" | null;
}

function fallbackRefine(response: string): RefineIntent {
  const maxPrice = extractMaxPrice(response);
  const terms = normalize(response)
    .split(" ")
    .filter((t) => t.length > 1 && !isStopword(t) && !/^\d+$/.test(t));
  const low = normalize(response);
  let sort_by_price: "asc" | "desc" | null = null;
  if (/(mais barato|baratinho|mais em conta|melhor preço|custo-benefício|custo beneficio)/.test(low)) {
    sort_by_price = "asc";
  } else if (/(mais caro|premium|melhor qualidade|top de linha|mais sofisticado)/.test(low)) {
    sort_by_price = "desc";
  }
  return { terms, max_price: maxPrice ?? null, sort_by_price };
}

async function refineIntent(
  response: string,
  history: string,
): Promise<RefineIntent> {
  try {
    const raw = await chat(
      [
        { role: "system", content: REFINE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Histórico da conversa:\n${history}\n\nResposta do cliente: "${response}"`,
        },
      ],
      { maxTokens: 600, temperature: 0 },
    );
    const parsed = extractJson<RefineIntent>(raw);
    if (parsed && Array.isArray(parsed.terms) && parsed.terms.length > 0) {
      const sort =
        parsed.sort_by_price === "asc" || parsed.sort_by_price === "desc"
          ? parsed.sort_by_price
          : null;
      return {
        terms: parsed.terms.slice(0, 6).map(String),
        max_price:
          typeof parsed.max_price === "number" && parsed.max_price > 0
            ? parsed.max_price
            : null,
        sort_by_price: sort,
      };
    }
  } catch (err) {
    if (err instanceof LlmError) {
      console.warn(`[converse] LLM indisponível, fallback lexical: ${err.message}`);
    }
  }
  return fallbackRefine(response);
}

function searchWithRefinement(
  catalog: CatalogProduct[],
  refine: RefineIntent,
  sessionTerms: string[],
  maxPrice: number | undefined,
): ScoredProduct[] {
  const llmResults = lexicalSearch(catalog, refine.terms, maxPrice);
  const rawResults = lexicalSearch(catalog, sessionTerms, maxPrice);

  const byId = new Map<string, ScoredProduct>();
  for (const r of [...llmResults, ...rawResults]) {
    const existing = byId.get(r.product.id);
    if (!existing || r.score > existing.score) byId.set(r.product.id, r);
  }
  const merged = [...byId.values()].sort(
    (a, b) => b.score - a.score || a.product.price - b.product.price,
  );
  const filtered = merged.filter((r) => r.score >= 0.1);
  return filtered.length >= 3 ? filtered : merged;
}

export const converseTool = (_env: Env) =>
  createTool({
    id: "converse",
    description:
      "Continua a conversa de recuperação: interpreta a resposta do cliente, refina a busca e devolve 3+ produtos + explicação + nova pergunta (loop).",
    inputSchema: converseInputSchema,
    outputSchema: converseOutputSchema,
    _meta: { ui: { resourceUri: CONVERSE_RESOURCE_URI } },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async ({ context }) => {
      const { session_id, user_response } = context as ConverseInput;
      const session = getSession(session_id);
      if (!session) {
        throw new Error(
          "Sessão não encontrada ou expirada. Chame search_recovery para iniciar uma nova conversa.",
        );
      }
      touchSession(session.id);

      const history = session.messages
        .slice(-6)
        .map((m) => `${m.role === "user" ? "Cliente" : "Agente"}: ${m.content}`)
        .join("\n");

      const [catalog, refine] = await Promise.all([
        fetchCatalog(),
        refineIntent(user_response, history),
      ]);

      const maxPrice = refine.max_price ?? extractMaxPrice(user_response);
      const sessionTerms = normalize(session.originalQuery)
        .split(" ")
        .filter((t) => t.length > 1 && !isStopword(t) && !/^\d+$/.test(t));

      let results = searchWithRefinement(
        catalog,
        refine,
        sessionTerms,
        maxPrice ?? undefined,
      );

      // Refinamento qualitativo de preço: "mais barato" → ordena por preço asc
      if (refine.sort_by_price === "asc") {
        results = [...results].sort((a, b) => a.product.price - b.product.price);
      } else if (refine.sort_by_price === "desc") {
        results = [...results].sort((a, b) => b.product.price - a.product.price);
      }

      // Quando o usuário pede re-ranqueamento por preço, NÃO descartar itens já
      // sugeridos — ele quer ver o mais barato/caro re-emfatizado, não novidade.
      // O filtro de novidade só se aplica a buscas de refinamento por termos.
      const fresh = refine.sort_by_price
        ? results
        : results.filter(
            (r) => !session.suggestedProductIds.includes(r.product.id),
          );
      const pool = fresh.length >= 3 ? fresh : results;
      let products = pool.slice(0, 5);
      // Garante o mínimo de 3 no contrato, completando com bestsellers quando
      // o refinamento não chega a 3 resultados. O padding respeita o teto de
      // preço (não estoura o orçamento do cliente).
      if (products.length < 3) {
        const seen = new Set(products.map((p) => p.product.id));
        const pad = popularProducts(catalog, 5)
          .filter((p) => !seen.has(p.id))
          .filter((p) => maxPrice === undefined || p.price <= maxPrice)
          .map((p) => ({
            product: p,
            score: 0,
            matchType: "PARTIAL" as const,
            rawHits: 0,
            rawTermCount: 0,
            rawCoverage: 0,
          }));
        products = [...products, ...pad].slice(0, 5);
      }
      addSuggestedProducts(
        session,
        products.map((p) => p.product.id),
      );

      const names = products.slice(0, 3).map((p) => p.product.title).join(", ");
      const priceNote =
        maxPrice != null ? ` dentro do limite de R$ ${maxPrice}` : "";
      const sortNote =
        refine.sort_by_price === "asc"
          ? " do mais barato para o mais caro"
          : refine.sort_by_price === "desc"
            ? " do mais caro para o mais barato"
            : "";
      const explanation =
        `Entendi: "${user_response}". Refinei a busca${priceNote}${sortNote} e encontrei: ` +
        `${names}.`;
      const followUp = products[0]
        ? `Algum desses te atende? Se quiser, me conta: prefere ${products[0].product.title} ou quer outra opção?`
        : "O que exatamente você está procurando?";

      addMessage(session, "user", user_response);
      addMessage(session, "assistant", `${explanation}\n${followUp}`);

      return {
        session_id: session.id,
        products: products.map(toProductOutput),
        explanation,
        follow_up_question: followUp,
      };
    },
  });
