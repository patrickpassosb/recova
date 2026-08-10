/**
 * T2 — converse (P0, loop da conversa)
 *
 * Interpreta a resposta do cliente, refina a busca (novos filtros/sinônimos)
 * e devolve 3+ produtos relevantes + explicação + nova pergunta. O contexto da
 * sessão (histórico) é preservado entre iterações.
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { chat, extractJson, LlmError } from "../lib/llm.ts";
import {
	addMessage,
	addSuggestedProducts,
	getSession,
	touchSession,
} from "../lib/sessions.ts";
import {
	type CatalogCategory,
	type CatalogProduct,
	deriveCatalogCategories,
	extractMaxPrice,
	fetchCatalog,
	findCategoryForTerms,
	isStopword,
	lexicalSearch,
	normalize,
	popularProducts,
	type ScoredProduct,
	toProductOutput,
} from "../lib/shopify.ts";
import type { Env } from "../types/env.ts";

export const CONVERSE_RESOURCE_URI = "ui://mcp-app/converse";

export const converseInputSchema = z.object({
	session_id: z.string().describe("ID da sessão criada pelo search_recovery"),
	user_response: z
		.string()
		.min(1)
		.max(500)
		.refine((r) => r.trim().length > 0, {
			message: "Resposta não pode ser vazia",
		})
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
				handle: z
					.string()
					.optional()
					.describe("Handle do produto — para linkar à página do produto"),
				description: z
					.string()
					.nullable()
					.describe("Descrição em texto puro cadastrada no Shopify"),
				price: z.number(),
				image: z.string().nullable(),
				score: z.number(),
				match_type: z.enum(["MATCH", "PARTIAL"]),
				variant_id: z
					.string()
					.nullable()
					.optional()
					.describe("MerchantId para adicionar ao carrinho"),
			}),
		)
		.describe("3+ produtos relevantes à resposta do cliente"),
	explanation: z
		.string()
		.describe("Explicação do porquê estes produtos foram escolhidos"),
	follow_up_question: z
		.string()
		.describe("Nova pergunta de refinamento (loop)"),
	refinement_options: z
		.array(z.string())
		.optional()
		.describe(
			"2-4 opções de refinamento (chips) relevantes à resposta do cliente — ex.: ['Casual', 'Esportivo', 'Dia a dia']",
		),
});

export type ConverseOutput = z.infer<typeof converseOutputSchema>;

interface RefineIntent {
	terms: string[];
	max_price: number | null;
	sort_by_price?: "asc" | "desc" | null;
}

/** Gera o prompt de refinamento com as categorias reais do catálogo da loja. */
function refineSystemPrompt(categories: CatalogCategory[]): string {
	const hint = categories.map((c) => c.label.toLowerCase()).join(", ");
	return [
		"Você é o agente de recuperação de busca de uma loja de e-commerce.",
		`O catálogo desta loja tem: ${hint}.`,
		"O cliente respondeu a uma pergunta de refinamento. Entenda a resposta e responda APENAS com JSON:",
		'{"terms": ["termos de busca em INGLÊS, separados"], "max_price": número ou null, "sort_by_price": "asc" | "desc" | null, "refinement_options": ["2-4 opções curtas em português para continuar refinando"]}',
		"Regras:",
		"- terms: 2 a 6 termos em inglês que casem com os tipos de produto ACIMA (não invente tipos fora da lista).",
		"- refinement_options: 2 a 4 opções contextuais (ex.: cliente pediu calçado → ['Casual', 'Esportivo', 'Dia a dia']; pediu adesivo → ['Programação', 'Comunidade', 'Frases']).",
		"- Se a resposta menciona preço numérico ('até 100', 'até R$ 50'), coloque o número em max_price.",
		"- Se a resposta pede o mais barato/baratinho ('mais barato', 'baratinho', 'mais em conta', 'quero o mais barato'), use sort_by_price: 'asc'.",
		"- Se a resposta pede o mais caro/premium, use sort_by_price: 'desc'.",
		"- NUNCA afirme cor, material ou atributo que não exista no catálogo. Se o cliente pedir cor, diga que não há filtro por cor (via follow_up_question).",
		"- NÃO invente produtos. Só devolva o JSON.",
	].join("\n");
}

/** Chips de fallback determinístico quando a LLM falha. */
function fallbackRefinementOptions(
	categories: CatalogCategory[],
	refine: RefineIntent,
): string[] {
	const cat = findCategoryForTerms(categories, refine.terms);
	if (cat?.id === "calçado") return ["Casual", "Esportivo", "Dia a dia"];
	if (cat?.id === "adesivo") return ["Programação", "Comunidade", "Frases"];
	if (cat?.id === "camiseta") return ["Básica", "Estampada", "Oversize"];
	if (cat?.id === "caneca") return ["Caneca", "Garrafa", "Térmico"];
	if (cat) return ["Mais barato", "Mais caro", "Outro estilo"];
	return ["Mais barato", "Mais caro"];
}

function fallbackRefine(response: string): RefineIntent {
	const maxPrice = extractMaxPrice(response);
	const terms = normalize(response)
		.split(" ")
		.filter((t) => t.length > 1 && !isStopword(t) && !/^\d+$/.test(t));
	const low = normalize(response);
	let sort_by_price: "asc" | "desc" | null = null;
	if (
		/(mais barato|baratinho|mais em conta|melhor preço|custo-benefício|custo beneficio)/.test(
			low,
		)
	) {
		sort_by_price = "asc";
	} else if (
		/(mais caro|premium|melhor qualidade|top de linha|mais sofisticado)/.test(
			low,
		)
	) {
		sort_by_price = "desc";
	}
	return { terms, max_price: maxPrice ?? null, sort_by_price };
}

interface RefineResult extends RefineIntent {
	refinement_options: string[];
}

async function refineIntent(
	response: string,
	history: string,
	categories: CatalogCategory[],
): Promise<RefineResult> {
	try {
		const raw = await chat(
			[
				{ role: "system", content: refineSystemPrompt(categories) },
				{
					role: "user",
					content: `Histórico da conversa:\n${history}\n\nResposta do cliente: "${response}"`,
				},
			],
			{ maxTokens: 700, temperature: 0 },
		);
		const parsed = extractJson<{
			terms?: unknown;
			max_price?: unknown;
			sort_by_price?: unknown;
			refinement_options?: unknown;
		}>(raw);
		if (parsed && Array.isArray(parsed.terms) && parsed.terms.length > 0) {
			const sort =
				parsed.sort_by_price === "asc" || parsed.sort_by_price === "desc"
					? parsed.sort_by_price
					: null;
			const options = Array.isArray(parsed.refinement_options)
				? parsed.refinement_options
						.filter((o): o is string => typeof o === "string" && o.length > 0)
						.slice(0, 4)
				: [];
			const base: RefineIntent = {
				terms: parsed.terms.slice(0, 6).map(String),
				max_price:
					typeof parsed.max_price === "number" && parsed.max_price > 0
						? parsed.max_price
						: null,
				sort_by_price: sort,
			};
			return {
				...base,
				refinement_options:
					options.length >= 2
						? options
						: fallbackRefinementOptions(categories, base),
			};
		}
	} catch (err) {
		if (err instanceof LlmError) {
			console.warn(
				`[converse] LLM indisponível, fallback lexical: ${err.message}`,
			);
		}
	}
	const base = fallbackRefine(response);
	return {
		...base,
		refinement_options: fallbackRefinementOptions(categories, base),
	};
}

function searchWithRefinement(
	catalog: CatalogProduct[],
	refine: RefineIntent,
	maxPrice: number | undefined,
): ScoredProduct[] {
	const llmResults = lexicalSearch(catalog, refine.terms, maxPrice);

	// Relevância mínima: pelo menos metade dos termos do cliente casou.
	// Evita falso positivo (ex.: "qual tipo de tenis" retornando stickers).
	const relevant = llmResults.filter((r) => r.rawCoverage >= 0.5);
	const results = relevant.length >= 3 ? relevant : llmResults;

	return results.sort(
		(a, b) => b.score - a.score || a.product.price - b.product.price,
	);
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

			const catalog = await fetchCatalog();
			const categories = deriveCatalogCategories(catalog);
			const refine = await refineIntent(user_response, history, categories);
			const originalTerms = fallbackRefine(session.originalQuery).terms.filter(
				(term) => !/^(oi+|ol[aá]|hello|hi|hey)$/i.test(term),
			);
			const searchTerms =
				refine.terms.length > 0 ? refine.terms : originalTerms;
			const contextualRefine = { ...refine, terms: searchTerms };

			const maxPrice = refine.max_price ?? extractMaxPrice(user_response);

			let results = searchWithRefinement(
				catalog,
				contextualRefine,
				maxPrice ?? undefined,
			);

			// Refinamento qualitativo de preço: "mais barato" → ordena por preço asc
			if (refine.sort_by_price === "asc") {
				results = [...results].sort(
					(a, b) => a.product.price - b.product.price,
				);
			} else if (refine.sort_by_price === "desc") {
				results = [...results].sort(
					(a, b) => b.product.price - a.product.price,
				);
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
			// Garante o mínimo de 3 no contrato, completando com produtos da MESMA
			// categoria dos termos do cliente (ex.: pediu tênis → completa com
			// calçados, não com stickers). O padding respeita o teto de preço
			// (não estoura o orçamento do cliente).
			if (products.length < 3) {
				const seen = new Set(products.map((p) => p.product.id));
				const cat = findCategoryForTerms(categories, contextualRefine.terms);
				const padTerms = cat?.terms ?? contextualRefine.terms;
				const pad = lexicalSearch(catalog, padTerms)
					.filter((r) => !seen.has(r.product.id))
					.filter((r) => maxPrice === undefined || r.product.price <= maxPrice)
					.slice(0, 5 - products.length)
					.map((r) => ({
						product: r.product,
						score: 0,
						matchType: "PARTIAL" as const,
						rawHits: 0,
						rawTermCount: 0,
						rawCoverage: 0,
					}));
				products = [...products, ...pad].slice(0, 5);
			}
			if (products.length === 0) {
				const popular = popularProducts(catalog, catalog.length).filter(
					(product) => maxPrice === undefined || product.price <= maxPrice,
				);
				const unseen = popular.filter(
					(product) => !session.suggestedProductIds.includes(product.id),
				);
				products = (unseen.length > 0 ? unseen : popular)
					.slice(0, 5)
					.map((product) => ({
						product,
						score: 0,
						matchType: "PARTIAL" as const,
						rawHits: 0,
						rawTermCount: 0,
						rawCoverage: 0,
					}));
			}
			addSuggestedProducts(
				session,
				products.map((p) => p.product.id),
			);

			const names = products
				.slice(0, 3)
				.map((p) => p.product.title)
				.join(", ");
			const priceNote =
				maxPrice != null ? ` dentro do limite de R$ ${maxPrice}` : "";
			const sortNote =
				refine.sort_by_price === "asc"
					? " do mais barato para o mais caro"
					: refine.sort_by_price === "desc"
						? " do mais caro para o mais barato"
						: "";

			// Explicação natural gerada pela LLM (com fallback para o template).
			let explanation: string;
			let followUp: string;
			try {
				const raw = await chat(
					[
						{
							role: "system",
							content: [
								"Você é o agente de recuperação de busca de uma loja de e-commerce.",
								"O cliente respondeu a uma pergunta de refinamento e você encontrou produtos.",
								"Responda APENAS com JSON:",
								'{"explanation": "explicação curta e natural em português do que você entendeu e encontrou, citando os produtos", "follow_up_question": "uma pergunta curta de refinamento em português"}',
								"Regras:",
								"- Explicação em 1-2 frases, tom de vendedor atencioso, sem listar preços.",
								"- follow_up_question: uma única pergunta para continuar refinando.",
								"- NUNCA afirme cor, material ou atributo que não exista nos produtos encontrados. Se o cliente pediu uma cor, diga que não há filtro por cor e ofereça as opções disponíveis.",
								"- NÃO invente produtos. Só devolva o JSON.",
							].join("\n"),
						},
						{
							role: "user",
							content:
								`Histórico:\n${history}\n\n` +
								`Resposta do cliente: "${user_response}"\n` +
								`Produtos encontrados: ${names}.`,
						},
					],
					{ maxTokens: 300, temperature: 0.4 },
				);
				const parsed = extractJson<{
					explanation?: string;
					follow_up_question?: string;
				}>(raw);
				if (parsed?.explanation && parsed.follow_up_question) {
					explanation = parsed.explanation;
					followUp = parsed.follow_up_question;
				} else {
					throw new LlmError("JSON incompleto");
				}
			} catch (err) {
				if (err instanceof LlmError) {
					console.warn(
						`[converse] LLM indisponível p/ explicação, template: ${err.message}`,
					);
				}
				explanation =
					`Entendi: "${user_response}". Refinei a busca${priceNote}${sortNote} e encontrei: ` +
					`${names}.`;
				followUp = products[0]
					? `Algum desses te atende? Se quiser, me conta: prefere ${products[0].product.title} ou quer outra opção?`
					: "O que exatamente você está procurando?";
			}

			addMessage(session, "user", user_response);
			addMessage(session, "assistant", `${explanation}\n${followUp}`);

			return {
				session_id: session.id,
				products: products.map(toProductOutput),
				explanation,
				follow_up_question: followUp,
				refinement_options: refine.refinement_options,
			};
		},
	});
