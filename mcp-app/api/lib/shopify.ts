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
}

export interface ScoredProduct {
  product: CatalogProduct;
  score: number;
  matchType: "MATCH" | "PARTIAL";
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
  }));

  catalogCache = { at: now, products };
  return products;
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

/** Extrai um teto de preço de uma query em PT ("até 300", "até R$ 300"). */
export function extractMaxPrice(query: string): number | undefined {
  const m = query.match(/at[eé]s?\s*(?:r\$\s*)?(\d{2,6})/i);
  if (m) return Number(m[1]);
  const m2 = query.match(/(?:r\$\s*)?(\d{2,6})\s*reais/i);
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
 * MATCH = todos os termos casaram; PARTIAL = pelo menos um.
 * Ordena por score desc, depois preço asc.
 */
export function lexicalSearch(
  catalog: CatalogProduct[],
  queryTerms: string[],
  maxPrice?: number,
): ScoredProduct[] {
  const terms = expandTerms(queryTerms.map(normalize).filter(Boolean));
  if (terms.length === 0) return [];

  const results: ScoredProduct[] = [];

  for (const product of catalog) {
    if (maxPrice !== undefined && product.price > maxPrice) continue;

    const titleTokens = tokenize(product.title);
    const haystack = titleTokens.join(" ");
    let hits = 0;
    let exactHits = 0;

    for (const term of terms) {
      const isMulti = term.includes(" ");
      if (isMulti) {
        // termo composto ("canvas shoes"): casa como substring do título
        if (haystack.includes(term)) {
          hits++;
          exactHits++;
        }
      } else if (titleTokens.includes(term)) {
        // token exato
        hits++;
        exactHits++;
      } else if (
        titleTokens.some(
          (tk) => tk.length >= 4 && (tk.startsWith(term) || term.startsWith(tk)),
        )
      ) {
        // prefixo de token (typo leve / plural)
        hits++;
      }
    }

    if (hits === 0) continue;

    const score = Math.round((hits / terms.length + exactHits / terms.length) * 50) / 100;
    results.push({
      product,
      score,
      matchType: hits === terms.length ? "MATCH" : "PARTIAL",
    });
  }

  results.sort((a, b) => b.score - a.score || a.product.price - b.product.price);
  return results;
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
  };
}
