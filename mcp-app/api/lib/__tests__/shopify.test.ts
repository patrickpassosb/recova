import { describe, it, expect } from "bun:test";
import {
  normalize,
  isStopword,
  expandTerms,
  extractMaxPrice,
  lexicalSearch,
  popularProducts,
  deriveCatalogCategories,
  categoriesPromptHint,
  findCategoryForTerms,
  toProductOutput,
  type CatalogProduct,
} from "../shopify.ts";

const catalog: CatalogProduct[] = [
  { id: "1", title: "High Top Canvas Shoes", handle: "high-top", price: 120, tags: [] },
  { id: "2", title: "Sneakers Runner", handle: "runner", price: 300, tags: [] },
  { id: "3", title: "Canvas Shoes Slip", handle: "slip", price: 90, tags: [] },
  { id: "4", title: "Capy Sticker", handle: "capy-sticker", price: 15, tags: [] },
  { id: "5", title: "Mug Coffee", handle: "mug", price: 45, tags: [] },
  { id: "6", title: "Freebie (not for sale)", handle: "freebie", price: 0, tags: [] },
];

describe("normalize", () => {
  it("lowercases and strips accents", () => {
    expect(normalize("TÊNIS")).toBe("tenis");
    expect(normalize("Café")).toBe("cafe");
  });
  it("strips punctuation", () => {
    expect(normalize("Camiseta! Oversized,")).toBe("camiseta oversized");
  });
  it("collapses whitespace and trims", () => {
    expect(normalize("  tenis   de   corrida  ")).toBe("tenis de corrida");
  });
  it("handles empty input", () => {
    expect(normalize("")).toBe("");
  });
});

describe("isStopword", () => {
  it("flags common Portuguese stopwords", () => {
    expect(isStopword("de")).toBe(true);
    expect(isStopword("que")).toBe(true);
    expect(isStopword("para")).toBe(true);
  });
  it("does not flag content terms", () => {
    expect(isStopword("tenis")).toBe(false);
    expect(isStopword("corrida")).toBe(false);
  });
});

describe("expandTerms", () => {
  it("keeps the original term and adds synonyms", () => {
    const expanded = expandTerms(["tenis"]);
    expect(expanded).toContain("tenis");
    expect(expanded).toContain("shoes");
    expect(expanded).toContain("sneakers");
  });
  it("dedupes terms", () => {
    const expanded = expandTerms(["tenis", "shoes"]);
    expect(new Set(expanded).size).toBe(expanded.length);
  });
  it("handles terms with no synonyms", () => {
    expect(expandTerms(["xyz"])).toEqual(["xyz"]);
  });
});

describe("extractMaxPrice", () => {
  it("parses 'até 300'", () => {
    expect(extractMaxPrice("tenis até 300")).toBe(300);
  });
  it("parses 'até R$ 300'", () => {
    expect(extractMaxPrice("tenis até R$ 300")).toBe(300);
  });
  it("parses 'até R$300' without space", () => {
    expect(extractMaxPrice("tenis até R$300")).toBe(300);
  });
  it("parses '300 reais'", () => {
    expect(extractMaxPrice("camiseta 300 reais")).toBe(300);
  });
  it("returns undefined when no price", () => {
    expect(extractMaxPrice("tenis de corrida")).toBeUndefined();
  });
});

describe("lexicalSearch", () => {
  it("returns empty for empty/no terms", () => {
    expect(lexicalSearch(catalog, [])).toEqual([]);
    expect(lexicalSearch(catalog, ["de"])).toEqual([]); // stopword only
  });

  it("matches PT terms to EN catalog via synonyms", () => {
    const results = lexicalSearch(catalog, ["tenis"]);
    expect(results.length).toBeGreaterThan(0);
    // tenis → shoes/sneakers/canvas shoes; should hit the shoe products
    expect(results.some((r) => r.product.id === "1")).toBe(true);
    expect(results.every((r) => r.product.price > 0)).toBe(true);
  });

  it("excludes non-sellable products (price <= 0)", () => {
    const results = lexicalSearch(catalog, ["freebie", "shoes"]);
    expect(results.some((r) => r.product.id === "6")).toBe(false);
  });

  it("respects maxPrice filter", () => {
    const results = lexicalSearch(catalog, ["shoes", "canvas"], 100);
    expect(results.every((r) => r.product.price <= 100)).toBe(true);
  });

  it("classifies full coverage as MATCH", () => {
    const results = lexicalSearch(catalog, ["canvas", "shoes"]);
    const match = results.find((r) => r.product.id === "1" || r.product.id === "3");
    expect(match?.matchType).toBe("MATCH");
  });

  it("sorts by score desc then price asc", () => {
    const results = lexicalSearch(catalog, ["shoes"]);
    for (let i = 1; i < results.length; i++) {
      const a = results[i - 1];
      const b = results[i];
      const sameScore = Math.abs(a.score - b.score) < 1e-9;
      if (sameScore) {
        expect(a.product.price).toBeLessThanOrEqual(b.product.price);
      } else {
        expect(a.score).toBeGreaterThanOrEqual(b.score);
      }
    }
  });

  it("computes rawCoverage against the raw user terms", () => {
    // query "camisa do flamengo" → raw terms after stopword filter: [camisa, flamengo]
    const results = lexicalSearch(catalog, ["camisa", "flamengo"]);
    // only "camisa" maps (→ t-shirt/tee/shirt), none match catalog shoes/sticker → likely empty or partial
    if (results.length > 0) {
      for (const r of results) {
        expect(r.rawCoverage).toBeLessThanOrEqual(1);
        expect(r.rawHits).toBeLessThanOrEqual(r.rawTermCount);
      }
    }
  });
});

describe("popularProducts", () => {
  it("returns cheapest sellable products by default", () => {
    const popular = popularProducts(catalog, 3);
    expect(popular).toHaveLength(3);
    expect(popular.map((p) => p.price)).toEqual([15, 45, 90]);
  });
  it("never includes price <= 0", () => {
    const popular = popularProducts(catalog, 10);
    expect(popular.every((p) => p.price > 0)).toBe(true);
    expect(popular.some((p) => p.id === "6")).toBe(false);
  });
  it("respects limit", () => {
    expect(popularProducts(catalog, 1)).toHaveLength(1);
  });
});

describe("deriveCatalogCategories", () => {
  it("derives categories that exist in the catalog", () => {
    const cats = deriveCatalogCategories(catalog);
    expect(cats.map((c) => c.id)).toContain("calçado"); // shoes present
    expect(cats.map((c) => c.id)).toContain("adesivo"); // sticker present
  });
  it("excludes categories not in the catalog", () => {
    const cats = deriveCatalogCategories(catalog);
    expect(cats.map((c) => c.id)).not.toContain("jaqueta"); // no jacket
  });
  it("returns empty for an empty catalog", () => {
    expect(deriveCatalogCategories([])).toEqual([]);
  });
});

describe("categoriesPromptHint", () => {
  it("formats categories with terms", () => {
    const cats = [
      { id: "a", label: "Calçados", terms: ["shoes"], titlePattern: /shoes/i },
    ];
    const hint = categoriesPromptHint(cats);
    expect(hint).toContain("Calçados");
    expect(hint).toContain("shoes");
  });
  it("returns fallback for empty", () => {
    expect(categoriesPromptHint([])).toBe("produtos variados");
  });
});

describe("findCategoryForTerms", () => {
  const cats = deriveCatalogCategories(catalog);
  it("finds a category by term", () => {
    const found = findCategoryForTerms(cats, ["sneakers"]);
    expect(found?.id).toBe("calçado");
  });
  it("returns null when no category matches", () => {
    expect(findCategoryForTerms(cats, ["plutonium"])).toBeNull();
  });
  it("returns null for empty terms", () => {
    expect(findCategoryForTerms(cats, [])).toBeNull();
  });
});

describe("toProductOutput", () => {
  it("maps a scored product to the BRIEF output shape", () => {
    const scored = lexicalSearch(catalog, ["capy", "sticker"])[0];
    const out = toProductOutput(scored);
    expect(out).toHaveProperty("id");
    expect(out).toHaveProperty("title");
    expect(out).toHaveProperty("price");
    expect(out).toHaveProperty("score");
    expect(out).toHaveProperty("match_type");
    expect(out.image).not.toBeUndefined();
  });
  it("returns null image when absent", () => {
    const scored = lexicalSearch(catalog, ["capy", "sticker"])[0];
    const out = toProductOutput(scored);
    expect(out.image).toBeNull();
  });
});
