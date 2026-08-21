import { afterEach } from "bun:test";

/**
 * Test catalog fixture mirroring the Shopify Storefront API shape the
 * `fetchCatalog` loader parses. All ids/prices are deterministic.
 */
export const TEST_CATALOG = [
	{
		id: "gid://1",
		title: "High Top Canvas Shoes",
		handle: "high-top-canvas-shoes",
		description: "Tênis de lona confortável para o dia a dia.",
		price: 120,
		tags: ["calçado"],
		variantId: "gid://var-1",
	},
	{
		id: "gid://2",
		title: "Sneakers Runner",
		handle: "sneakers-runner",
		price: 300,
		tags: ["calçado"],
		variantId: "gid://var-2",
	},
	{
		id: "gid://3",
		title: "Canvas Shoes Slip",
		handle: "canvas-shoes-slip",
		price: 90,
		tags: ["calçado"],
		variantId: "gid://var-3",
	},
	{
		id: "gid://4",
		title: "Capy Sticker",
		handle: "capy-sticker",
		price: 15,
		tags: ["adesivo"],
		variantId: "gid://var-4",
	},
	{
		id: "gid://5",
		title: "Mug Coffee",
		handle: "mug-coffee",
		price: 45,
		tags: ["caneca"],
		variantId: "gid://var-5",
	},
	{
		id: "gid://6",
		title: "Eco Tote Bag",
		handle: "eco-tote-bag",
		price: 35,
		tags: ["bolsa"],
		variantId: "gid://var-6",
	},
	{
		id: "gid://7",
		title: "Pixel Perfection Pen",
		handle: "pen",
		price: 12,
		tags: ["caneta"],
		variantId: "gid://var-7",
	},
	// Produtos adicionais para satisfazer o contrato no-repeat de 3+ em 3+
	// iterações do loop (7 produtos não bastam para 3 iterações sem repetir).
	{
		id: "gid://8",
		title: "Dev Mode Tee",
		handle: "dev-mode-tee",
		price: 60,
		tags: ["camiseta"],
		variantId: "gid://var-8",
	},
	{
		id: "gid://9",
		title: "Eco Raglan Hoodie",
		handle: "eco-raglan-hoodie",
		price: 150,
		tags: ["moletom"],
		variantId: "gid://var-9",
	},
	{
		id: "gid://10",
		title: "Minimalist Backpack",
		handle: "minimalist-backpack",
		price: 200,
		tags: ["bolsa"],
		variantId: "gid://var-10",
	},
	{
		id: "gid://11",
		title: "Winter Hat",
		handle: "winter-hat",
		price: 40,
		tags: ["boné"],
		variantId: "gid://var-11",
	},
	{
		id: "gid://12",
		title: "Stainless Steel Water Bottle",
		handle: "water-bottle",
		price: 80,
		tags: ["garrafa"],
		variantId: "gid://var-12",
	},
	{
		id: "gid://13",
		title: "Insulated Tumbler",
		handle: "insulated-tumbler",
		price: 70,
		tags: ["caneca"],
		variantId: "gid://var-13",
	},
	{
		id: "gid://14",
		title: "Capy Coding Companion Sticker",
		handle: "capy-coding",
		price: 10,
		tags: ["adesivo"],
		variantId: "gid://var-14",
	},
	// Mais calçados para o contrato no-repeat de 3+ em 3+ iterações do loop
	// (o query "tenis" casa com calçados; sem estes, a 2ª iteração não acha
	// 3 novos e repete os já sugeridos).
	{
		id: "gid://15",
		title: "Sublimation Flip Flops",
		handle: "sublimation-flip-flops",
		price: 25,
		tags: ["calçado"],
		variantId: "gid://var-15",
	},
	{
		id: "gid://16",
		title: "Women's Slides",
		handle: "womens-slides",
		price: 30,
		tags: ["calçado"],
		variantId: "gid://var-16",
	},
	{
		id: "gid://17",
		title: "Trail Running Sneakers",
		handle: "trail-running-sneakers",
		price: 280,
		tags: ["calçado"],
		variantId: "gid://var-17",
	},
	{
		id: "gid://18",
		title: "Canvas High Top",
		handle: "canvas-high-top",
		price: 95,
		tags: ["calçado"],
		variantId: "gid://var-18",
	},
	// Mais camisetas para o fallback lexical de "camiseta oversized" (>=3).
	{
		id: "gid://19",
		title: "Oversize T-Shirt",
		handle: "oversize-t-shirt",
		price: 55,
		tags: ["camiseta"],
		variantId: "gid://var-19",
	},
	{
		id: "gid://20",
		title: "Classic Cotton Tee",
		handle: "classic-cotton-tee",
		price: 50,
		tags: ["camiseta"],
		variantId: "gid://var-20",
	},
	// Mais calçados: o search_recovery retorna até 5 por chamada e o converse
	// precisa de 3 NOVOS por iteração (3 iterações = 9+). Com 7 calçados o
	// second repetia os já sugeridos (pickProducts cai para `results` quando
	// fresh < 3). Estes garantem 3 novos em cada iteração do loop.
	{
		id: "gid://21",
		title: "Running Shoes Pro",
		handle: "running-shoes-pro",
		price: 260,
		tags: ["calçado"],
		variantId: "gid://var-21",
	},
	{
		id: "gid://22",
		title: "Canvas Slip-On",
		handle: "canvas-slip-on",
		price: 85,
		tags: ["calçado"],
		variantId: "gid://var-22",
	},
	{
		id: "gid://23",
		title: "High Top Sneakers",
		handle: "high-top-sneakers",
		price: 110,
		tags: ["calçado"],
		variantId: "gid://var-23",
	},
	{
		id: "gid://24",
		title: "Comfort Slides",
		handle: "comfort-slides",
		price: 20,
		tags: ["calçado"],
		variantId: "gid://var-24",
	},
	// Suficientes calçados para o loop: startSession sugere 5 + 3 iterações de
	// converse (até 5 cada) = até 20 sugeridos. Com 11 calçados a 3ª iteração
	// repetia. Estes garantem 3 NOVOS em cada uma das 3 iterações.
	{
		id: "gid://25",
		title: "Trail Sneakers",
		handle: "trail-sneakers",
		price: 240,
		tags: ["calçado"],
		variantId: "gid://var-25",
	},
	{
		id: "gid://26",
		title: "Canvas Low Top",
		handle: "canvas-low-top",
		price: 75,
		tags: ["calçado"],
		variantId: "gid://var-26",
	},
	{
		id: "gid://27",
		title: "Running Sneakers",
		handle: "running-sneakers",
		price: 220,
		tags: ["calçado"],
		variantId: "gid://var-27",
	},
	{
		id: "gid://28",
		title: "Slip-On Shoes",
		handle: "slip-on-shoes",
		price: 65,
		tags: ["calçado"],
		variantId: "gid://var-28",
	},
	{
		id: "gid://29",
		title: "High Top Canvas",
		handle: "high-top-canvas",
		price: 100,
		tags: ["calçado"],
		variantId: "gid://var-29",
	},
	{
		id: "gid://30",
		title: "Sport Slides",
		handle: "sport-slides",
		price: 28,
		tags: ["calçado"],
		variantId: "gid://var-30",
	},
	// Mais calçados: o loop sugere até 5 por iteração (3 iterações) + 5 do
	// startSession = até 20 sugeridos. Com 17 calçados a 3ª iteração repetia.
	{
		id: "gid://31",
		title: "Running Shoes Elite",
		handle: "running-shoes-elite",
		price: 290,
		tags: ["calçado"],
		variantId: "gid://var-31",
	},
	{
		id: "gid://32",
		title: "Canvas Sneakers",
		handle: "canvas-sneakers",
		price: 88,
		tags: ["calçado"],
		variantId: "gid://var-32",
	},
	{
		id: "gid://33",
		title: "High Top Shoes",
		handle: "high-top-shoes",
		price: 105,
		tags: ["calçado"],
		variantId: "gid://var-33",
	},
	{
		id: "gid://34",
		title: "Slides Comfort",
		handle: "slides-comfort",
		price: 22,
		tags: ["calçado"],
		variantId: "gid://var-34",
	},
	// O loop sugere até 5 por iteração (3 iterações) + 5 do start = até 20.
	// Só produtos cujo TÍTULO casa com "shoes/sneakers/canvas shoes" contam
	// para o no-repeat (o lexicalSearch casa por título). Estes garantem >=20
	// produtos casáveis para 3 iterações sem repetir.
	{
		id: "gid://35",
		title: "Running Shoes",
		handle: "running-shoes",
		price: 210,
		tags: ["calçado"],
		variantId: "gid://var-35",
	},
	{
		id: "gid://36",
		title: "Sneakers Classic",
		handle: "sneakers-classic",
		price: 130,
		tags: ["calçado"],
		variantId: "gid://var-36",
	},
	{
		id: "gid://37",
		title: "Canvas Shoes",
		handle: "canvas-shoes",
		price: 92,
		tags: ["calçado"],
		variantId: "gid://var-37",
	},
	{
		id: "gid://38",
		title: "High Top Sneakers Pro",
		handle: "high-top-sneakers-pro",
		price: 140,
		tags: ["calçado"],
		variantId: "gid://var-38",
	},
	{
		id: "gid://39",
		title: "Running Shoes Lite",
		handle: "running-shoes-lite",
		price: 180,
		tags: ["calçado"],
		variantId: "gid://var-39",
	},
	{
		id: "gid://40",
		title: "Canvas Shoes Classic",
		handle: "canvas-shoes-classic",
		price: 98,
		tags: ["calçado"],
		variantId: "gid://var-40",
	},
	{
		id: "gid://41",
		title: "Sneakers Runner Pro",
		handle: "sneakers-runner-pro",
		price: 250,
		tags: ["calçado"],
		variantId: "gid://var-41",
	},
	{
		id: "gid://42",
		title: "High Top Canvas Shoes Pro",
		handle: "high-top-canvas-shoes-pro",
		price: 160,
		tags: ["calçado"],
		variantId: "gid://var-42",
	},
] as const;

/** Builds a Storefront API GraphQL response body for the test catalog. */
export function shopifyGraphqlResponse() {
	return JSON.stringify({
		data: {
			products: {
				edges: TEST_CATALOG.map((p) => ({
					node: {
						id: p.id,
						title: p.title,
						handle: p.handle,
						description: "description" in p ? p.description : null,
						productType: null,
						tags: [...p.tags],
						priceRange: { minVariantPrice: { amount: String(p.price) } },
						featuredImage: null,
						variants: { edges: [{ node: { id: p.variantId } }] },
					},
				})),
			},
		},
	});
}

export interface LlmScenario {
	/** Raw content the LLM "returns" (should be JSON). */
	content?: string;
	/** Overrides status code of the LLM response. */
	status?: number;
	/** If true, respond with an HTTP error before reading body. */
	httpError?: boolean;
}

export interface StubOptions {
	/** When set, the LLM returns this scenario for every chat call. */
	llm?: LlmScenario;
	/** Override the catalog response status (e.g. to test fetchCatalog failure). */
	catalogStatus?: number;
}

const originalFetch = globalThis.fetch;

/**
 * Stubs `globalThis.fetch` to route the two real network boundaries the
 * agent uses:
 *  - Shopify Storefront API  (fetchCatalog)
 *  - Ollama LLM endpoint      (chat)
 *
 * This exercises the real parsing, synonyms, scoring and fallback logic
 * while keeping every call deterministic and offline. Returns a cleanup fn.
 */
export function stubNetwork(opts: StubOptions = {}): () => void {
	const hadKey = process.env.OLLAMA_API_KEY;
	// chat() exige uma chave para chamar o endpoint; o stub precisa fingir que
	// ela existe para o caminho "LLM disponível" ser exercitado offline.
	process.env.OLLAMA_API_KEY = hadKey || "stubbed-test-key";

	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = String(input);

		if (url.includes("myshopify.com")) {
			if (opts.catalogStatus && opts.catalogStatus !== 200) {
				return new Response("catalog error", { status: opts.catalogStatus });
			}
			return new Response(shopifyGraphqlResponse(), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}

		if (url.includes("ollama.com")) {
			if (opts.llm?.httpError) {
				return new Response("network error", { status: 503 });
			}
			if (opts.llm?.status && opts.llm.status !== 200) {
				return new Response("llm error", { status: opts.llm.status });
			}
			const content =
				opts.llm?.content ??
				JSON.stringify({
					terms: ["shoes", "canvas shoes"],
					category: "calçado",
					max_price: null,
					refinement_options: ["Casual", "Esportivo", "Dia a dia"],
				});
			return new Response(
				JSON.stringify({ choices: [{ message: { content } }] }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}

		throw new Error(`Unexpected fetch in test: ${url}`);
	}) as typeof fetch;

	return () => {
		globalThis.fetch = originalFetch;
		if (hadKey === undefined) {
			delete process.env.OLLAMA_API_KEY;
		} else {
			process.env.OLLAMA_API_KEY = hadKey;
		}
	};
}

/**
 * Restores a stubbed fetch after each test. Import this once in a describe
 * block that uses `stubNetwork`.
 */
export function restoreFetchAfterEach(): void {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});
}
