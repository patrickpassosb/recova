/**
 * Catálogo Shopify (loja demo `gimenesdevstore`) + busca lexical com scoring.
 *
 * Regra de ouro: NUNCA inventar produto — tudo que esta lib retorna veio da
 * Storefront API (grounded no catálogo real). O `storefrontAccessToken` é um
 * token público de storefront (por design, exposto no client) e já está
 * commitado no repo em `.deco/blocks/deco-shopify.json` do demo-storefront.
 * O `adminAccessToken` NÃO é usado aqui (fica criptografado na plataforma).
 */

export interface CatalogProduct {
  id: string;
  title: string;
  handle: string;
  price: number;
  image?: string;
  productType?: string;
  tags?: string[];
  /** MerchantId da variante default — necessário para adicionar ao carrinho. */
  variantId?: string;
}

export interface ScoredProduct {
  product: CatalogProduct;
  score: number;
  matchType: "MATCH" | "PARTIAL";
  /**
   * Fração (0..1) de termos CRUOS do usuário que produziram ao menos um hit.
   * Mede cobertura sobre o que o cliente digitou (não sobre os termos
   * expandidos por sinônimo), evitando falso positivo quando só um sinônimo
   * genérico (ex.: camisa→t-shirt) casa e o resto da query não.
   */
  rawCoverage: number;
  /** Quantos termos crus do usuário casaram (de `rawTermCount`). */
  rawHits: number;
  rawTermCount: number;
}

const STORE_NAME = "gimenesdevstore";
const STOREFRONT_TOKEN = "71f2c3da0dab3b4eee7dce35eb8c6113";
const API_URL = `https://${STORE_NAME}.myshopify.com/api/2024-01/graphql.json`;

const CATALOG_TTL_MS = 5 * 60_000;
let catalogCache: { at: number; products: CatalogProduct[] } | null = null;

/** Busca o catálogo completo na Storefront API (com cache em memória). */
export async function fetchCatalog(): Promise<CatalogProduct[]> {
  const now = Date.now();
  if (catalogCache && now - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.products;
  }

  const query = `query Catalog {
    products(first: 100) {
      edges {
        node {
          id
          title
          handle
          productType
          tags
          priceRange { minVariantPrice { amount } }
          featuredImage { url }
          variants(first: 1) { edges { node { id } } }
        }
      }
    }
  }`;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(4000),
  });

  if (!res.ok) {
    throw new Error(`Storefront API falhou: HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    data?: { products?: { edges?: Array<{ node: Record<string, unknown> }> } };
  };

  const edges = json.data?.products?.edges ?? [];
  const products: CatalogProduct[] = edges.map(({ node }) => ({
    id: String(node.id),
    title: String(node.title),
    handle: String(node.handle),
    price: Number(
      (node.priceRange as { minVariantPrice?: { amount?: string } })
        ?.minVariantPrice?.amount ?? 0,
    ),
    image:
      (node.featuredImage as { url?: string } | null)?.url ?? undefined,
    productType: node.productType ? String(node.productType) : undefined,
    tags: Array.isArray(node.tags) ? node.tags.map(String) : [],
    variantId: (
      node.variants as
        | { edges?: Array<{ node?: { id?: string } }> }
        | undefined
    )?.edges?.[0]?.node?.id,
  }));

  catalogCache = { at: now, products };
  return products;
}

/** Categoria derivada do catálogo real (100% dinâmico, funciona em qualquer loja). */
export interface CatalogCategory {
  id: string;
  /** Rótulo em português para o prompt da LLM e para os chips. */
  label: string;
  /** Termos de busca (inglês) que casam com esta categoria no catálogo. */
  terms: string[];
  /** Padrões de título que definem a categoria. */
  titlePattern: RegExp;
}

/**
 * Padrões de família de produto (título → categoria). A ordem importa:
 * padrões mais específicos primeiro (ex.: "water bottle" antes de "bottle").
 */
const CATEGORY_PATTERNS: Array<Omit<CatalogCategory, "titlePattern"> & { titlePattern: RegExp }> = [
  { id: "calçado", label: "Calçados", terms: ["shoes", "sneakers", "canvas shoes", "flip flops", "slides"], titlePattern: /canvas shoe|sneaker|flip flop|slide|high top/i },
  { id: "camiseta", label: "Camisetas", terms: ["t-shirt", "tee", "shirt"], titlePattern: /t-shirt|tee|shirt/i },
  { id: "moletom", label: "Moletons e suéteres", terms: ["hoodie", "sweatshirt"], titlePattern: /hoodie|sweatshirt/i },
  { id: "jaqueta", label: "Jaquetas", terms: ["jacket"], titlePattern: /jacket/i },
  { id: "calça", label: "Calças", terms: ["pants", "sweatpants", "joggers"], titlePattern: /sweatpant|jogger|pant/i },
  { id: "caneca", label: "Canecas e garrafas", terms: ["mug", "tumbler", "bottle", "water bottle"], titlePattern: /mug|tumbler|bottle/i },
  { id: "bolsa", label: "Bolsas e mochilas", terms: ["backpack", "tote bag", "bag"], titlePattern: /backpack|tote|bag/i },
  { id: "boné", label: "Bonés e chapéus", terms: ["hat", "bucket hat", "winter hat", "cap"], titlePattern: /hat|cap/i },
  { id: "caderno", label: "Cadernos", terms: ["notebook"], titlePattern: /notebook/i },
  { id: "caneta", label: "Canetas", terms: ["pen"], titlePattern: /pen/i },
  { id: "almofada", label: "Almofadas", terms: ["pillow"], titlePattern: /pillow/i },
  { id: "capa", label: "Capas de celular", terms: ["snap case", "case"], titlePattern: /case/i },
  { id: "adesivo", label: "Adesivos", terms: ["sticker"], titlePattern: /sticker/i },
];

/**
 * Deriva as categorias que EXISTEM no catálogo da loja.
 * Qualquer loja plugada ganha categorias corretas — nada de lista fixa.
 */
export function deriveCatalogCategories(catalog: CatalogProduct[]): CatalogCategory[] {
  const present: CatalogCategory[] = [];
  for (const pattern of CATEGORY_PATTERNS) {
    const has = catalog.some((p) => pattern.titlePattern.test(p.title));
    if (has) {
      present.push({
        id: pattern.id,
        label: pattern.label,
        terms: pattern.terms,
        titlePattern: pattern.titlePattern,
      });
    }
  }
  return present;
}

/** Descrição das categorias para o prompt da LLM (ex.: "calçados, camisetas, canecas"). */
export function categoriesPromptHint(categories: CatalogCategory[]): string {
  if (categories.length === 0) return "produtos variados";
  return categories.map((c) => `${c.label} (${c.terms.join(", ")})`).join(", ");
}

/**
 * Encontra a categoria mais provável para um conjunto de termos de busca.
 * Usado no padding: completa com produtos da MESMA família do pedido.
 */
export function findCategoryForTerms(
  categories: CatalogCategory[],
  terms: string[],
): CatalogCategory | null {
  for (const cat of categories) {
    const hit = terms.some((t) =>
      cat.terms.some((term) => t.includes(term) || term.includes(t)),
    );
    if (hit) return cat;
  }
  return null;
}

/** Normaliza texto para comparação: minúsculas, sem acentos, sem pontuação. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "um", "uma", "uns", "umas", "o", "a", "os",
  "as", "e", "ou", "para", "pra", "com", "sem", "até", "ate", "por", "em",
  "no", "na", "nos", "nas", "que", "quero", "preciso", "procuro", "me",
  "minha", "meu", "queria", "gostaria", "tem", "ter", "comprar", "comprando",
  "busca", "buscar", "quando", "sobre", "mais", "menos", "até", "r$", "reais",
]);

export function isStopword(term: string): boolean {
  return STOPWORDS.has(term);
}

/** Dicionário PT→EN de sinônimos (fallback lexical quando o LLM falha). */
export const SYNONYMS: Record<string, string[]> = {
  tenis: ["tenis", "shoes", "sneakers", "canvas shoes", "flip flops", "slides"],
  sapato: ["shoes", "sneakers", "canvas shoes", "slides"],
  chinelo: ["flip flops", "slides"],
  corrida: ["running", "shoes", "sneakers", "canvas shoes"],
  // Sinônimos EN→EN: a LLM gera termos em inglês que precisam casar com os
  // títulos reais do catálogo (ex.: "sneakers" → "High Top Canvas Shoes").
  sneakers: ["sneakers", "shoes", "canvas shoes"],
  shoes: ["shoes", "sneakers", "canvas shoes"],
  running: ["running", "shoes", "sneakers", "canvas shoes"],
  "flip flops": ["flip flops", "slides"],
  slides: ["slides", "flip flops"],
  "canvas shoes": ["canvas shoes", "shoes", "sneakers"],
  camiseta: ["t-shirt", "tee", "shirt", "oversize t-shirt"],
  camisa: ["t-shirt", "tee", "shirt"],
  caneca: ["mug", "tumbler"],
  cafe: ["mug", "tumbler"],
  café: ["mug", "tumbler"],
  mochila: ["backpack"],
  garrafa: ["bottle", "water bottle"],
  garrafinha: ["bottle", "water bottle"],
  termica: ["tumbler", "bottle", "water bottle"],
  térmica: ["tumbler", "bottle", "water bottle"],
  copo: ["tumbler", "mug"],
  boné: ["hat", "bucket hat", "winter hat"],
  bone: ["hat", "bucket hat", "winter hat"],
  chapeu: ["hat", "bucket hat"],
  chapéu: ["hat", "bucket hat"],
  moletom: ["hoodie", "sweatshirt", "raglan hoodie"],
  blusa: ["hoodie", "sweatshirt", "t-shirt", "tee"],
  jaqueta: ["jacket", "bomber jacket", "rain jacket"],
  casaco: ["jacket", "bomber jacket", "rain jacket", "hoodie"],
  calca: ["pants", "jeans"],
  calça: ["pants", "jeans"],
  bermuda: ["shorts"],
  meia: ["socks"],
  adesivo: ["sticker"],
  sticker: ["sticker"],
  caderno: ["notebook", "syntax scribbler notebook"],
  notebook: ["notebook", "syntax scribbler notebook"],
  caneta: ["pen", "pixel perfection pen"],
  almofada: ["pillow"],
  travesseiro: ["pillow"],
  bolsa: ["tote bag", "backpack", "bag"],
  ecobag: ["tote bag", "eco tote bag"],
  tote: ["tote bag"],
  capa: ["snap case", "case"],
  celular: ["snap case", "case", "iphone"],
  iphone: ["snap case", "case"],
  garrafa_termica: ["bottle", "water bottle", "tumbler"],
  caneca_termica: ["tumbler", "mug"],
  regata: ["t-shirt", "tee"],
  sueter: ["sweatshirt", "hoodie"],
  suéter: ["sweatshirt", "hoodie"],
  camiseta_oversized: ["oversize t-shirt"],
  tenis_corrida: ["shoes", "sneakers", "canvas shoes"],
  roupa: ["t-shirt", "hoodie", "sweatshirt", "jacket", "tee"],
  crianca: ["kids t-shirt", "sticker"],
  kids: ["kids t-shirt"],
  feminino: ["women's"],
  masculino: ["men's"],
  capivara: ["capy"],
  capy: ["capy"],
  monstro: ["capy"],
};

/** Expande termos da query com sinônimos PT→EN. */
export function expandTerms(terms: string[]): string[] {
  const out = new Set<string>();
  for (const t of terms) {
    out.add(t);
    const syns = SYNONYMS[t];
    if (syns) for (const s of syns) out.add(s);
  }
  return [...out];
}

/** Extrai um teto de preço de uma query em PT ("até 300", "até R$ 300", "até 5"). */
export function extractMaxPrice(query: string): number | undefined {
  const m = query.match(/at[eé]s?\s*(?:r\$\s*)?(\d{1,6})/i);
  if (m) return Number(m[1]);
  const m2 = query.match(/(?:r\$\s*)?(\d{1,6})\s*reais/i);
  if (m2) return Number(m2[1]);
  return undefined;
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Busca lexical com scoring sobre o catálogo.
 *
 * - MATCH = todos os termos crus do usuário casaram; PARTIAL = pelo menos um.
 * - `rawCoverage` mede a fração de termos crus que casaram (contra os
 *   expandidos por sinônimo), para o caller poder recusar falso positivo
 *   (ex.: "camisa do flamengo" casando só via sinônimo genérico camisa→t-shirt).
 * - Produtos com `price <= 0` são sempre excluídos (não são vendíveis).
 * - Ordena por score desc, depois preço asc.
 */
export function lexicalSearch(
  catalog: CatalogProduct[],
  queryTerms: string[],
  maxPrice?: number,
): ScoredProduct[] {
  const raw = queryTerms.map(normalize).filter((t) => t.length > 1 && !STOPWORDS.has(t));
  if (raw.length === 0) return [];

  // mapeia cada termo expandido → índice do termo cru que o originou
  const expandedOwners = new Map<string, number>();
  raw.forEach((r, i) => {
    for (const t of expandTerms([r])) {
      if (!expandedOwners.has(t)) expandedOwners.set(t, i);
    }
  });
  const terms = [...expandedOwners.keys()];
  if (terms.length === 0) return [];

  const results: ScoredProduct[] = [];

  for (const product of catalog) {
    if (maxPrice !== undefined && product.price > maxPrice) continue;
    if (product.price <= 0) continue; // não é vendível

    const titleTokens = tokenize(product.title);
    const haystack = titleTokens.join(" ");
    let hits = 0;
    let exactHits = 0;

    // quais termos crus (índice) casaram em ao menos um sinônimo expandido
    const rawMatched = new Set<number>();

    for (const term of terms) {
      let termHit = false;
      const isMulti = term.includes(" ");
      if (isMulti) {
        if (haystack.includes(term)) {
          hits++;
          exactHits++;
          termHit = true;
        }
      } else if (titleTokens.includes(term)) {
        hits++;
        exactHits++;
        termHit = true;
      } else if (
        titleTokens.some(
          (tk) => tk.length >= 4 && (tk.startsWith(term) || term.startsWith(tk)),
        )
      ) {
        hits++;
        termHit = true;
      }

      if (termHit) {
        const owner = expandedOwners.get(term);
        if (owner !== undefined) rawMatched.add(owner);
      }
    }

    if (hits === 0) continue;

    const score = Math.round((hits / terms.length + exactHits / terms.length) * 50) / 100;
    results.push({
      product,
      score,
      matchType: rawMatched.size === raw.length ? "MATCH" : "PARTIAL",
      rawHits: rawMatched.size,
      rawTermCount: raw.length,
      rawCoverage: raw.length > 0 ? rawMatched.size / raw.length : 0,
    });
  }

  results.sort((a, b) => b.score - a.score || a.product.price - b.product.price);
  return results;
}

/** Produtos populares do catálogo (fallback quando a busca não acha nada). */
export function popularProducts(catalog: CatalogProduct[], limit = 5): CatalogProduct[] {
  return catalog
    .filter((p) => p.price > 0)
    .slice()
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

/** Formata um produto para o output das tools (shape do BRIEF). */
export function toProductOutput(p: ScoredProduct) {
  return {
    id: p.product.id,
    title: p.product.title,
    price: p.product.price,
    image: p.product.image ?? null,
    score: p.score,
    match_type: p.matchType,
    variant_id: p.product.variantId ?? null,
  };
}
