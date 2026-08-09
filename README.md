# Recova

**A segunda chance da sua busca.**

**Hackathon Agents for Commerce — Deco (2026)**

A Recova é uma camada de IA para e-commerce que é acionada quando a busca da loja não encontra ou não entende o que o cliente procura. Ela conversa, mostra alternativas e ajuda a recuperar a venda — sem substituir a busca que você já usa.

## O problema

- **10–20%** das buscas internas em e-commerce retornam zero resultados (LATAM lidera por regionalismos)
- Quando o cliente encontra zero resultados, **a conversão cai 50–87%** e **12% dos compradores vão ao concorrente**
- **63% dos lojistas estão insatisfeitos** com a busca nativa da plataforma
- Usuários de busca **convertem 3–5x mais** que navegadores — é o canal de maior intenção de compra, e ele está vazando

## O impacto em números (bottom-up)

> **Loja de alto volume:** 40 mil buscas/dia · 12% zero-results = **4.800 buscas perdidas/dia** · conversão base 3,1% · AOV R$ 120
> = **≈ R$ 4,3 milhões/ano de receita em risco.**
>
> A Recova recuperando **só 10%** disso = **+R$ 430 mil/ano**, a custo de **< R$ 0,05 por conversa**.

A conta inteira (buscas → zero-results → conversão × AOV → receita recuperada) está no final do README e na apresentação — o júri não discute número com a conta na mesa.

## A solução

Camada fina de IA que atua **sobre** a busca nativa (não substitui) — e funciona como um **loop agêntico fechado** (a linguagem da Deco: *observar → diagnosticar → propor → executar → medir → aprender*), não como um chatbot esperando prompt:

```text
OBSERVAR   busca nativa retorna zero results (ou baixa relevância)
   ↓
DIAGNOSTICAR  understand_intent (LLM) → termos/categoria/preço + causa do vazamento
   ↓
PROPOR      3+ produtos REAIS do catálogo (Storefront API, grounded) em <2s + explicação
   ├── CLIENTE COMPROU → EXECUTAR (add-to-cart) → ✅ SUCESSO (verde)
   ├── CLIENTE RESPONDEU → 3+ produtos + explicação + nova pergunta (loop ↺)
   └── NÃO RESPONDEU em 30s → reengajamento (máx 2) → ❌ sem conversão (vermelho)
   ↓
MEDIR/APRENDER  analyze_zero_results → relatório de causas + correções (T4)
```

As 4 tools MCP mapeiam exatamente esse loop: **`search_recovery`** (observar/diagnosticar/propor), **`converse`** (refinar), **`reengage`** (não desistir), **`analyze_zero_results`** (medir & aprender — o que transforma o responder em agente operador).

### Diferenciação

| Player | Abordagem | Gap que exploramos |
|---|---|---|
| Constructor, Algolia, Bloomreach | Substituem a busca inteira (enterprise, caro) | Não atacam o zero-results da busca nativa |
| Alhena | Busca conversacional full-page (substitui a experiência) | Não é camada de recuperação |
| Doofinder, Klevu, Searchspring | Apps de busca (SMB/mid) | Trocar ≠ consertar |
| VTEX IS, Shopify S&D | Busca nativa (grátis) | Não conversam, não recuperam |
| **Recova** | **Entra SÓ quando a busca falha, com loop de reengajamento** | **Ninguém faz isso como produto** |

## Estrutura do repo

```
recova/
├── mcp-app/             # O AGENTE — tools MCP (search_recovery, converse, reengage, analyze_zero_results)
├── demo-storefront/     # O AMBIENTE DE DEMO — overlay conversacional na busca
└── docs/
    ├── PRD.md           # Product Requirements Document (v2)
    ├── FLUXOGRAMA.md    # Jornada do usuário (fluxograma)
    └── search-recovery-fluxograma.excalidraw  # Fluxograma editável
```

## Stack

- **mcp-app**: Bun + @decocms/runtime (MCP server) + React 19 + shadcn/ui — tools com UI
- **demo-storefront**: TanStack Start + React 19 + Cloudflare Workers + Shopify Storefront API (loja demo `gimenesdevstore`)
- **LLM**: DeepSeek V4 Flash (API oficial do Ollama Cloud, `ollama.com/v1`) — custo < R$0.05/conversa

## Como rodar

```bash
# MCP App (o agente)
cd mcp-app
bun install
bun run dev          # servidor MCP em http://localhost:3001/api/mcp

# Demo storefront (o ambiente)
cd demo-storefront
bun install
bun run dev          # storefront com overlay conversacional
```

## Métricas do MVP

| Métrica | Baseline | Alvo |
|---|---|---|
| Time-to-alternatives | N/A | <2s |
| Conversational conversion | 3.1% (sem IA) | 12%+ |
| Zero-results recovery | 0% | 30%+ |
| Recovery após timeout 30s | 0% | 5%+ |
| Custo por conversa | N/A | <R$0.05 |

## Branding

- **Nome:** Recova (marca proprietária, sem tradução)
- **Tagline:** "A segunda chance da sua busca"
- **Cores:** Azul Recova `#155EEF`, Azul Profundo `#102A43`, Laranja Resgate `#F97316`, Verde `#16A34A`
- **Tipografia:** Manrope (display) + Inter (corpo)
- **Brand book completo:** `docs/brand_book.md` (no vault do time)

## Ferramentas usadas

- Claude Code / agentes de IA (ferramenta livre conforme regras do evento)
- Deco Studio (créditos) + MCP App + demo-storefront
- DeepSeek V4 Flash
- Bun, TanStack Start, React 19, Tailwind v4

---

## A conta da receita recuperada (bottom-up)

Premissas de uma loja de alto volume (todas citáveis, todas conservadoras):

| Linha | Valor | Fonte |
|---|---|---|
| Buscas internas/dia | 40.000 | loja alto volume (referência mercado) |
| Taxa de zero-results | 12% | SearchMind 12,5% global; LATAM lidera |
| Buscas perdidas/dia | 4.800 | 40.000 × 12% |
| Conversão base (busca) | 3,1% | benchmark indústria |
| AOV | R$ 120 | tíquete médio SMB brasileiro |
| Receita em risco/ano | **≈ R$ 4,3 M** | 4.800 × 3,1% × R$ 120 × 365 |
| Taxa de recuperação da Recova | 10% | conservador; target do MVP 30%+ |
| **Receita recuperada/ano** | **≈ R$ 430 mil** | 4,3 M × 10% |
| Custo por conversa | **< R$ 0,05** | DeepSeek V4 Flash, cache, max_tokens baixo |
| Custo anual ≈ | R$ 2.900 | 4.800 × 365 × 10% × R$ 0,05 |

Mesmo recuperando **1 em cada 10** buscas perdidas e com custo de centavos por conversa, o ROI é de **centenas de milhares de reais/ano** — sem trocar a busca, sem dev, sem custo de adoção.

---

Projeto desenvolvido durante o Hackathon Agents for Commerce (Deco), 01–09/08/2026.
