import { describe, it, expect } from "bun:test";
import { relative, rebaseSearch, rebaseToSearch } from "../url.ts";

describe("sdk/url relative", () => {
  it("extracts pathname+search from a link", () => {
    expect(relative("/produto/tenis")).toBe("/produto/tenis");
  });

  it("keeps search params", () => {
    expect(relative("/busca?q=tenis&p=2")).toBe("/busca?q=tenis&p=2");
  });

  it("drops the origin", () => {
    expect(relative("https://shop.example/produto/tenis")).toBe("/produto/tenis");
  });

  it("returns undefined for empty link", () => {
    expect(relative(undefined)).toBeUndefined();
  });

  it("returns undefined for falsy link", () => {
    expect(relative("")).toBeUndefined();
  });
});

describe("sdk/url rebaseSearch", () => {
  it("keeps base pathname and adopts loader search params", () => {
    const out = rebaseSearch("/lista?page=3", "/minha-pagina");
    expect(out).toBe("/minha-pagina?page=3");
  });

  it("returns undefined when loaderHref is empty", () => {
    expect(rebaseSearch(undefined, "/base")).toBeUndefined();
  });

  it("falls back to the loader path when base is missing", () => {
    const out = rebaseSearch("/lista?page=3", undefined);
    expect(out).toBe("/lista?page=3");
  });

  it("handles a loader href with its own path and query (URL-encodes accents)", () => {
    const out = rebaseSearch("/colecao?categoria=calçado&sort=asc", "/base");
    expect(out).toBe("/base?categoria=cal%C3%A7ado&sort=asc");
  });
});

describe("sdk/url rebaseToSearch", () => {
  it("returns to/search separately for Router Links", () => {
    const out = rebaseToSearch("/lista?page=3&cor=azul", "/minha-pagina");
    expect(out).toEqual({ to: "/minha-pagina", search: { page: "3", cor: "azul" } });
  });

  it("returns undefined when rebase fails", () => {
    expect(rebaseToSearch(undefined, "/base")).toBeUndefined();
  });
});
