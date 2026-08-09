/**
 * T4 — analyze_zero_results (P1, correção cirúrgica)
 *
 * Analisa termos de busca com zero resultados, agrupa por causa (typo,
 * sinônimo, produto não catalogado, regionalismo) e sugere correções.
 * Aceita logs reais; sem logs, usa dados de demonstração.
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { chat, extractJson, LlmError } from "../lib/llm.ts";
import { fetchCatalog, normalize } from "../lib/shopify.ts";

export const ANALYZE_RESOURCE_URI = "ui://mcp-app/analyze-zero-results";

export const analyzeZeroResultsInputSchema = z.object({
  logs: z
    .array(
      z.object({
        term: z.string(),
        volume: z.number().int().positive().optional(),
      }),
    )
    .max(200)
    .optional()
    .describe("Logs de buscas com zero resultados (termo + volume). Sem logs, usa demonstração."),
});

export type AnalyzeZeroResultsInput = z.infer<typeof analyzeZeroResultsInputSchema>;

export const analyzeZeroResultsOutputSchema = z.object({
  report: z
    .array(
      z.object({
        term: z.string(),
        volume: z.number(),
        cause: z.enum(["typo", "sinonimo", "nao_catalogado", "regionalismo"]),
        suggested_fix: z.string(),
      }),
    )
    .describe("Top 10 termos com causa classificada e correção sugerida"),
  summary: z.string().describe("Resumo executivo da análise"),
});

export type AnalyzeZeroResultsOutput = z.infer<typeof analyzeZeroResultsOutputSchema>;

const DEMO_LOGS = [
  { term: "tenis de corrida", volume: 342 },
  { term: "camiseta de programador", volume: 218 },
  { term: "caneca de café", volume: 187 },
  { term: "mochila para notebook", volume: 156 },
  { term: "boné de inverno", volume: 121 },
  { term: "garrafa térmica", volume: 98 },
  { term: "adesivo de capivara", volume: 87 },
  { term: "calça jeans", volume: 76 },
  { term: "travesseiro", volume: 64 },
  { term: "meia de lã", volume: 52 },
  { term: "copo térmico", volume: 48 },
  { term: "regata", volume: 41 },
  { term: "bermuda", volume: 33 },
  { term: "casaco de frio", volume: 29 },
  { term: "suéter", volume: 25 },
];

const CAUSE_RULES: Array<{
  cause: "typo" | "sinonimo" | "nao_catalogado" | "regionalismo";
  test: (term: string, catalogTitles: string[]) => boolean;
  fix: (term: string) => string;
}> = [
  {
    // Ordem importa: "sinônimo" e "regionalismo" primeiro — "tenis nike" é
    // melhor classificado como sinônimo (tenis→shoes) do que como typo, e o
    // "fix" de typo não pode ser um no-op (ver regra typo abaixo).
    cause: "sinonimo",
    test: (term, catalogTitles) => {
      // qualquer token do termo com sinônimo que casa com o catálogo
      const tokens = normalize(term).split(" ").filter((t) => t.length > 1);
      const synonyms: Record<string, string[]> = {
        "tenis": ["shoes", "sneakers", "canvas shoes", "flip flops", "slides"],
        "corrida": ["shoes", "sneakers", "canvas shoes"],
        "camiseta": ["t-shirt", "tee", "shirt"],
        "caneca": ["mug", "tumbler"],
        "cafe": ["mug", "tumbler"],
        "mochila": ["backpack"],
        "notebook": ["notebook", "backpack"],
        "bone": ["hat", "bucket hat", "winter hat"],
        "inverno": ["winter hat", "hoodie", "sweatshirt"],
        "garrafa": ["bottle", "water bottle"],
        "termica": ["tumbler", "bottle"],
        "adesivo": ["sticker"],
        "capivara": ["capy"],
        "travesseiro": ["pillow"],
        "sueter": ["sweatshirt", "hoodie"],
        "casaco": ["jacket", "hoodie"],
        "meia": ["socks"],
        "regata": ["t-shirt", "tee"],
        "bermuda": ["shorts"],
        "calca": ["pants"],
        "blusa": ["hoodie", "sweatshirt", "t-shirt"],
        "copo": ["tumbler", "mug"],
        "programador": ["tee", "hoodie", "sticker"],
        "dev": ["tee", "hoodie", "sticker"],
      };
      return tokens.some((t) => {
        const syns = synonyms[t];
        if (!syns) return false;
        return syns.some((s) =>
          catalogTitles.some((title) => normalize(title).includes(normalize(s))),
        );
      });
    },
    fix: (term) => `Mapear sinônimo: "${term}" → termos do catálogo (ex.: t-shirt, mug, bottle)`,
  },
  {
    cause: "regionalismo",
    test: (term) => {
      const regional: string[] = [
        "chinelo", "bermuda", "regata", "suéter", "travesseiro", "copo",
        "caneca", "boné", "calça", "meia", "casaco", "blusa", "tênis",
      ];
      return regional.some((r) => normalize(term).includes(normalize(r)));
    },
    fix: (term) => `Adicionar regionalismo: "${term}" → sinônimo local (ex.: chinelo → flip flops)`,
  },
  {
    cause: "typo",
    test: (term) => {
      // typos comuns: acentuação/ortografia errada que normaliza diferente
      const typos: Record<string, string> = {
        "tenis": "tênis",
        "chapeu": "chapéu",
        "sueter": "suéter",
        "calca": "calça",
        "bone": "boné",
        "caneca": "caneca",
      };
      return Object.keys(typos).some((t) => term === t);
    },
    // Corrige de verdade: devolve a forma acentuada, não um no-op via normalize.
    fix: (term) => {
      const typos: Record<string, string> = {
        "tenis": "tênis",
        "chapeu": "chapéu",
        "sueter": "suéter",
        "calca": "calça",
        "bone": "boné",
        "caneca": "caneca",
      };
      const corrected = typos[term] ?? term;
      return `Corrigir ortografia: "${term}" → "${corrected}"`;
    },
  },
  {
    cause: "nao_catalogado",
    test: () => true,
    fix: (term) => `Avaliar inclusão no catálogo: "${term}" não existe na loja`,
  },
];

const ANALYZE_SYSTEM_PROMPT = [
  "Você é o analista de buscas de uma loja de e-commerce.",
  "Receba uma lista de termos de busca que retornaram zero resultados e o catálogo da loja.",
  "Para cada termo, classifique a causa em UMA das categorias:",
  "- typo: erro de digitação/acentuação",
  "- sinonimo: o termo existe no catálogo com outro nome (ex.: caneca → mug)",
  "- regionalismo: termo regional brasileiro para produto do catálogo",
  "- nao_catalogado: produto que a loja não vende",
  "Responda APENAS com JSON:",
  '{"causes": [{"term": "...", "cause": "typo|sinonimo|regionalismo|nao_catalogado", "suggested_fix": "..."}]}',
  "NÃO invente termos. Só classifique os termos recebidos.",
].join("\n");

export const analyzeZeroResultsTool = (_env: Env) =>
  createTool({
    id: "analyze_zero_results",
    description:
      "Analisa buscas com zero resultados: classifica a causa (typo, sinônimo, não catalogado, regionalismo) e sugere correções cirúrgicas para o lojista.",
    inputSchema: analyzeZeroResultsInputSchema,
    outputSchema: analyzeZeroResultsOutputSchema,
    _meta: { ui: { resourceUri: ANALYZE_RESOURCE_URI } },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async ({ context }) => {
      const { logs } = context as AnalyzeZeroResultsInput;
      const terms = (logs && logs.length > 0 ? logs : DEMO_LOGS)
        .slice(0, 50)
        .map((l) => ({ term: l.term, volume: l.volume ?? 1 }));

      const catalog = await fetchCatalog();
      const catalogTitles = catalog.map((p) => p.title);

      // Classificação por regras (rápida e determinística)
      const classified = terms.map(({ term, volume }) => {
        const rule = CAUSE_RULES.find((r) => r.test(term, catalogTitles));
        return {
          term,
          volume,
          cause: rule?.cause ?? "nao_catalogado",
          suggested_fix: rule?.fix(term) ?? `Avaliar inclusão no catálogo: "${term}"`,
        };
      });

      // Tenta refinar com o LLM (se disponível); mantém regras como fallback
      let refined = classified;
      try {
        const raw = await chat(
          [
            { role: "system", content: ANALYZE_SYSTEM_PROMPT },
            {
              role: "user",
              content:
                `Catálogo: ${catalogTitles.slice(0, 40).join(", ")}\n\n` +
                `Termos: ${terms.map((t) => `"${t.term}"`).join(", ")}`,
            },
          ],
          { maxTokens: 800, temperature: 0 },
        );
        const parsed = extractJson<{
          causes?: Array<{ term: string; cause: string; suggested_fix: string }>;
        }>(raw);
        if (parsed?.causes?.length) {
          const byTerm = new Map(
            parsed.causes.map((c) => [normalize(c.term), c]),
          );
          refined = classified.map((c) => {
            const llm = byTerm.get(normalize(c.term));
            if (!llm) return c;
            const cause = ["typo", "sinonimo", "nao_catalogado", "regionalismo"].includes(
              llm.cause,
            )
              ? (llm.cause as "typo" | "sinonimo" | "nao_catalogado" | "regionalismo")
              : c.cause;
            return {
              ...c,
              cause,
              suggested_fix: llm.suggested_fix || c.suggested_fix,
            };
          });
        }
      } catch (err) {
        if (err instanceof LlmError) {
          console.warn(`[analyze_zero_results] LLM indisponível, regras locais: ${err.message}`);
        }
      }

      const report = [...refined]
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 10);

      const byCause = new Map<string, number>();
      for (const r of report) {
        byCause.set(r.cause, (byCause.get(r.cause) ?? 0) + r.volume);
      }
      const total = report.reduce((acc, r) => acc + r.volume, 0);
      const top = [...byCause.entries()].sort((a, b) => b[1] - a[1]);
      const causeLabel: Record<string, string> = {
        typo: "typos",
        sinonimo: "sinônimos não mapeados",
        nao_catalogado: "produtos não catalogados",
        regionalismo: "regionalismos",
      };
      const summary =
        `Analisados ${report.length} termos de busca com zero resultados ` +
        `(${total} buscas). Principais causas: ` +
        top
          .map(([c, v]) => `${causeLabel[c] ?? c} (${Math.round((v / total) * 100)}%)`)
          .join(", ") +
        ". Correções sugeridas no relatório.";

      return { report, summary };
    },
  });
