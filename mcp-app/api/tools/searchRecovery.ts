/**
 * T1 — search_recovery (P0, coração do agente)
 *
 * Entra quando a busca nativa retorna zero resultados (ou baixa relevância):
 * entende a intenção do cliente (categoria, atributos, preço, sinônimos,
 * typos) via LLM, busca no catálogo Shopify (Storefront API) e devolve 3+
 * produtos relevantes com score MATCH/PARTIAL, uma explicação do porquê e
 * uma pergunta de refinamento — tudo em <2s.
 *
 * Zero alucinação: produtos vêm SEMPRE da Storefront API (grounded no
 * catálogo). O LLM só decide termos de busca; nunca inventa produto.
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { chat, extractJson, LlmError } from "../lib/llm.ts";
import {
  deriveCatalogCategories,
  extractMaxPrice,
  fetchCatalog,
  isStopword,
  lexicalSearch,
  normalize,
  popularProducts,
  toProductOutput,
  type CatalogCategory,
  type CatalogProduct,
  type ScoredProduct,
} from "../lib/shopify.ts";
import {
  addMessage,
  addSuggestedProducts,
  createSession,
  getSession,
  pruneSessions,
  touchSession,
} from "../lib/sessions.ts";

export const SEARCH_RECOVERY_RESOURCE_URI = "ui://mcp-app/search-recovery";

export const searchRecoveryInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(200)
    .refine((q) => q.trim().length > 0, { message: "Query não pode ser vazia" })
    .describe("Termo livre digitado pelo cliente na busca (pode ter typos, preço, categoria)"),
  session_id: z
    .string()
    .optional()
    .describe("ID de sessão existente para continuar a conversa (opcional)"),
});

export type SearchRecoveryInput = z.infer<typeof searchRecoveryInputSchema>;

export const searchRecoveryOutputSchema = z.object({
  session_id: z.string().describe("ID da sessão — use nas tools converse/reengage"),
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
    .describe("3+ produtos relevantes do catálogo (nunca inventados)"),
  explanation: z.string().describe("Explicação do porquê estes produtos foram escolhidos"),
  follow_up_question: z.string().describe("Pergunta de refinamento para o cliente"),
  refinement_options: z
    .array(z.string())
    .optional()
    .describe("2-4 opções de refinamento (chips) relevantes à query — ex.: ['Casual', 'Esportivo', 'Dia a dia']"),
});

export type SearchRecoveryOutput = z.infer<typeof searchRecoveryOutputSchema>;

interface Intent {
  terms: string[];
  category: string | null;
  max_price: number | null;
}

/** Prompt dinâmico com as categorias reais do catálogo da loja. */
function intentSystemPrompt(categories: CatalogCategory[]): string {
  const hint = categories.map((c) => c.label.toLowerCase()).join(", ");
  return [
    "Você é o motor de entendimento de intenção de busca de uma loja de e-commerce.",
    `O catálogo desta loja tem: ${hint}.`,
    "Receba a query do cliente (em português, pode ter typos e regionalismos) e responda APENAS com JSON:",
    '{"terms": ["termos de busca em INGLÊS, separados"], "category": "categoria ou null", "max_price": número ou null, "refinement_options": ["2-4 opções curtas em português para continuar refinando"]}',
    "Regras:",
    "- terms: 2 a 6 termos em inglês que casem com os tipos de produto ACIMA (não invente tipos fora da lista).",
    "- refinement_options: 2 a 4 opções contextuais (ex.: query de calçado → ['Casual', 'Esportivo', 'Dia a dia']; query de adesivo → ['Programação', 'Comunidade', 'Frases']).",
    "- Se a query tem preço ('até 300', 'até R$ 300'), coloque o número em max_price.",
    "- category: 'sticker', 'camiseta', 'moletom', 'caneca', 'mochila', 'garrafa', 'boné', 'caderno', 'bolsa', 'calçado', 'acessório' ou null.",
    "- NUNCA afirme cor, material ou atributo que não exista no catálogo.",
    "- NÃO invente produtos. Só devolva o JSON.",
  ].join("\n");
}

function fallbackIntent(query: string): Intent {
  const maxPrice = extractMaxPrice(query);
  const terms = normalize(query)
    .split(" ")
    .filter(
      (t) =>
        t.length > 1 &&
        !isStopword(t) &&
        !/^\d+$/.test(t),
    );
  return { terms, category: null, max_price: maxPrice ?? null };
}

/**
 * Busca combinada: termos do LLM (inglês) + termos crus da query (PT, com
 * sinônimos). O merge garante que mesmo com LLM lento/ruim o resultado é
 * relevante e chega em <2s.
 *
 * Retorna `{ results, lowConfidence }`: `lowConfidence` é true quando a
 * cobertura dos termos crus do usuário é fraca (falso positivo provável) —
 * o caller deve clarificar em vez de afirmar "encontrei".
 */
function combinedSearch(
  catalog: CatalogProduct[],
  intent: Intent,
  query: string,
  maxPrice: number | undefined,
): { results: ScoredProduct[]; lowConfidence: boolean } {
  const llmResults = lexicalSearch(catalog, intent.terms, maxPrice);
  const rawTerms = fallbackIntent(query).terms;
  const lexicalResults = lexicalSearch(catalog, rawTerms, maxPrice);

  const byId = new Map<string, ScoredProduct>();
  for (const r of [...llmResults, ...lexicalResults]) {
    const existing = byId.get(r.product.id);
    if (!existing || r.score > existing.score) byId.set(r.product.id, r);
  }
  const merged = [...byId.values()].sort(
    (a, b) => b.score - a.score || a.product.price - b.product.price,
  );

  // Filtro de ruído: 1 hit solto (prefixo acidental) não é relevância.
  // Se o filtro deixar menos de 3 produtos, relaxa para garantir o mínimo.
  const filtered = merged.filter((r) => r.score >= 0.1);
  const results = filtered.length >= 3 ? filtered : merged;

  // Cobertura do melhor resultado sobre os termos crus: baixa cobertura com
  // query multi-token = falso positivo (ex.: "camisa do flamengo" → só o
  // sinônimo camisa casou). Sinaliza para clarificar em vez de afirmar.
  const rawTermCount = fallbackIntent(query).terms.length;
  const bestCoverage = results.reduce(
    (max, r) => Math.max(max, r.rawCoverage),
    0,
  );
  const lowConfidence =
    rawTermCount > 1 && bestCoverage < 0.6 && results.length > 0;

  return { results, lowConfidence };
}

const INTENT_CACHE_TTL_MS = 10 * 60_000;
const intentCache = new Map<string, { at: number; intent: Intent }>();

interface IntentResult extends Intent {
  refinement_options: string[];
}

async function understandIntent(
  query: string,
  categories: CatalogCategory[],
): Promise<IntentResult> {
  const key = normalize(query);
  const hit = intentCache.get(key);
  if (hit && Date.now() - hit.at < INTENT_CACHE_TTL_MS) {
    return { ...hit.intent, refinement_options: [] };
  }

  let intent: Intent | null = null;
  let options: string[] = [];
  try {
    const raw = await chat(
      [
        { role: "system", content: intentSystemPrompt(categories) },
        { role: "user", content: `Query do cliente: "${query}"` },
      ],
      { maxTokens: 700, temperature: 0 },
    );
    const parsed = extractJson<{
      terms?: unknown;
      category?: unknown;
      max_price?: unknown;
      refinement_options?: unknown;
    }>(raw);
    if (parsed && Array.isArray(parsed.terms) && parsed.terms.length > 0) {
      intent = {
        terms: parsed.terms.slice(0, 6).map(String),
        category: typeof parsed.category === "string" ? parsed.category : null,
        max_price:
          typeof parsed.max_price === "number" && parsed.max_price > 0
            ? parsed.max_price
            : null,
      };
      if (Array.isArray(parsed.refinement_options)) {
        options = parsed.refinement_options
          .filter((o): o is string => typeof o === "string" && o.length > 0)
          .slice(0, 4);
      }
    }
  } catch (err) {
    if (err instanceof LlmError) {
      console.warn(`[search_recovery] LLM indisponível, fallback lexical: ${err.message}`);
    }
  }

  const final = intent ?? fallbackIntent(query);
  intentCache.set(key, { at: Date.now(), intent: final });
  return {
    ...final,
    refinement_options: options.length >= 2 ? options : ["Mais barato", "Mais caro"],
  };
}

function pickProducts(results: ScoredProduct[], excludeIds: string[]): ScoredProduct[] {
  const fresh = results.filter((r) => !excludeIds.includes(r.product.id));
  const pool = fresh.length >= 3 ? fresh : results;
  return pool.slice(0, 5);
}

function buildExplanation(
  query: string,
  products: ScoredProduct[],
  intent: Intent,
): string {
  const names = products.slice(0, 3).map((p) => p.product.title).join(", ");
  const priceNote =
    intent.max_price != null
      ? ` dentro do limite de R$ ${intent.max_price}`
      : "";
  return (
    `Entendi que você procura "${query}". Encontrei no catálogo${priceNote}: ` +
    `${names}.`
  );
}

function buildLowConfidenceExplanation(query: string): string {
  return (
    `Não tenho certeza se encontrei exatamente o que você quer com "${query}". ` +
    `Encontrei algumas opções que talvez sirvam — me diga se alguma se aproxima:`
  );
}

function buildBestsellerExplanation(query: string): string {
  return (
    `Não encontrei nada com "${query}" no catálogo, mas estes são os produtos ` +
    `mais populares da loja. Talvez um deles te interesse:`
  );
}

function buildFollowUp(products: ScoredProduct[]): string {
  const first = products[0]?.product;
  if (!first) return "O que exatamente você está procurando?";
  return (
    `Algum desses te atende? Se quiser, me conta: você prefere ${first.title} ` +
    `ou está buscando outra faixa de preço / estilo?`
  );
}

export const searchRecoveryTool = (_env: Env) =>
  createTool({
    id: "search_recovery",
    description:
      "Recupera vendas perdidas: quando a busca nativa retorna zero resultados, entende a intenção do cliente e devolve 3+ produtos relevantes do catálogo com explicação e pergunta de refinamento.",
    inputSchema: searchRecoveryInputSchema,
    outputSchema: searchRecoveryOutputSchema,
    _meta: { ui: { resourceUri: SEARCH_RECOVERY_RESOURCE_URI } },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    execute: async ({ context }) => {
      const { query, session_id } = context as SearchRecoveryInput;
      pruneSessions();

      const session = session_id ? getSession(session_id) : undefined;
      const activeSession = session ?? createSession(query);
      if (session) touchSession(session.id);

      const catalog = await fetchCatalog();
      const categories = deriveCatalogCategories(catalog);
      const intent = await understandIntent(query, categories);

      const maxPrice = intent.max_price ?? extractMaxPrice(query);
      const { results, lowConfidence } = combinedSearch(
        catalog,
        intent,
        query,
        maxPrice ?? undefined,
      );

      let explanation: string;
      let followUp: string;
      let chosen: ScoredProduct[];

      if (lowConfidence) {
        // Cobertura fraca → clarificar em vez de afirmar "encontrei"
        chosen = results.slice(0, 5);
        explanation = buildLowConfidenceExplanation(query);
        followUp = buildFollowUp(chosen);
      } else if (results.length === 0) {
        // Nada no catálogo → recupera com bestsellers (respeitando o teto de
        // preço, se houver — não estoura o orçamento do cliente).
        const bestsellers = popularProducts(catalog, 5)
          .filter((p) => maxPrice === undefined || p.price <= maxPrice);
        chosen = bestsellers.map((p) => ({
          product: p,
          score: 0,
          matchType: "PARTIAL" as const,
          rawHits: 0,
          rawTermCount: 0,
          rawCoverage: 0,
        }));
        explanation = buildBestsellerExplanation(query);
        followUp = buildFollowUp(chosen);
      } else {
        chosen = results;
        explanation = buildExplanation(query, chosen, intent);
        followUp = buildFollowUp(chosen);
      }

      const products = pickProducts(chosen, activeSession.suggestedProductIds);
      // Garante o mínimo de 3 no contrato, completando com bestsellers quando
      // a busca (ex.: filtrada por preço) não chega a 3 resultados.
      // O padding respeita o teto de preço (não estoura o orçamento do cliente).
      let finalProducts = products;
      let padded = false;
      if (finalProducts.length < 3) {
        const seen = new Set(finalProducts.map((p) => p.product.id));
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
        finalProducts = [...finalProducts, ...pad].slice(0, 5);
        padded = pad.length > 0;
      }
      // Se houve padding, a explicação precisa refletir o retorno real
      // (senão diz "Encontrei: X, Y" mas devolve 5 produtos).
      if (padded && !lowConfidence && results.length > 0) {
        explanation = buildExplanation(query, finalProducts, intent);
      }
      addSuggestedProducts(
        activeSession,
        finalProducts.map((p) => p.product.id),
      );

      addMessage(activeSession, "user", query);
      addMessage(
        activeSession,
        "assistant",
        `${explanation}\n${followUp}`,
      );

      return {
        session_id: activeSession.id,
        products: finalProducts.map(toProductOutput),
        explanation,
        follow_up_question: followUp,
        refinement_options: intent.refinement_options,
      };
    },
  });
