---
type: Note
title: "PRD - Search Recovery Agent (MVP)"
updated: "2026-08-06"
related_to: "[[agents-for-commerce-deco]]"
---

# PRD — Search Recovery Agent (MVP Hackathon Deco)

**Modo:** rapid_prd (skill prd-engineering do Gabriel) | **Workspace:** `/tmp/opencode/prd-workspace/`
**Data:** 06/08/2026 (v2 — reestruturado conforme fluxograma do Patrick) | **Deadline:** 09/08 23h59 | **Time:** Patrick + Gabriel

---

## 1. Problema (independente da solução)

**12-15% das buscas em lojas online retornam zero resultados** (LATAM lidera por regionalismos). Quando o shopper encontra zero results, **a conversão cai 87%** e **12% dos compradores vão ao concorrente**. **63% dos lojistas estão insatisfeitos** com a busca nativa da plataforma. Usuários de busca **convertem 3-5x mais** que navegadores — ou seja, a busca é o canal de maior intenção de compra, e ele está vazando.

**A dor:** a busca nativa (VTEX Intelligent Search, Shopify Search, Wix) falha em queries de intenção — typos (35%), sinônimos não mapeados (25%), produto não catalogado (20%), regionalismos (12%). O lojista não tem como consertar sem trocar a busca inteira (caro) ou contratar dev.

## 2. Solução: Search Recovery Agent (fluxograma do Patrick)

**Camada fina de IA que entra quando a busca falha** — não substitui a busca, **recupera as vendas que ela perde**:

```
┌─────────────────────────────────────────────────────────────────┐
│  PESQUISA DO PRODUTO NA FAIXA (busca nativa)                    │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  AGENTE DE IA ENTRA COMO CHAT                                   │
│  automaticamente mostra 3+ produtos relevantes em <2s           │
└──────────────┬──────────────────────────────┬───────────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────┐   ┌──────────────────────────────────┐
│ CLIENTE COMPROU UMA DAS  │   │ CLIENTE RESPONDE À PERGUNTA      │
│ SUGESTÕES                │   └──────────────┬───────────────────┘
└──────────────┬───────────┘                  ▼
               │              ┌──────────────────────────────────┐
               ▼              │ RESPONDE A PERGUNTA              │
      ┌──────────────┐        └──────────────┬───────────────────┘
      │ ✅ SUCESSO   │                       ▼
      │ (VERDE)      │      ┌──────────────────────────────────┐
      └──────────────┘      │ 3+ PRODUTOS RELEVANTES PARA A    │
                            │ RESPOSTA + 1 EXPLICAÇÃO DO PORQUÊ │
                            │ + 1 PERGUNTA (LOOP)              │
                            └──────────────┬───────────────────┘
                                           │ (loop ↺)
                                           ▼
        ┌──────────────────────────────────────────────────┐
        │ NÃO RESPONDEU A NENHUMA PERGUNTA NEM ADICIONOU   │
        │ AO CARRINHO                                      │
        └──────────────────────────┬───────────────────────┘
                                   ▼
        ┌──────────────────────────────────────────────────┐
        │ ESPERAR 30 SEGUNDOS E ENVIAR MAIS UMA MENSAGEM   │
        │ DE PERGUNTA (LOOP ↺)                             │
        └──────────────────────────┬───────────────────────┘
                                   ▼
        ┌──────────────────────────────────────────────────┐
        │ ❌ NÃO ADICIONOU NADA NO CARRINHO (VERMELHO)     │
        └──────────────────────────────────────────────────┘
```

**Anotação do fluxograma (configurabilidade):** "uma pergunta ou 3 respostas pré-definidas — este agente, e uma quero opção dele escrever" → o lojista configura as perguntas/respostas do agente (REQ-006).

**Estados terminais:** ✅ VERDE = conversão (cliente comprou); ❌ VERMELHO = sem conversão (não adicionou nada).

**Diferenciação vs. mercado (análise de 30+ empresas):**

| Player | Abordagem | Gap que exploramos |
|---|---|---|
| Constructor, Algolia, Bloomreach | Substituem a busca inteira (enterprise, caro) | **Não atacam o zero-results da busca nativa** |
| Alhena | Full-page conversational search (substitui a experiência) | **Não é camada de recuperação — é substituição** |
| Doofinder, Klevu, Searchspring | Apps de busca (SMB/mid) | **Trocar ≠ consertar** |
| VTEX IS, Shopify S&D | Busca nativa (grátis) | **Não conversam, não recuperam** |
| **Nós** | **Search Recovery: entra SÓ quando falha, com loop de reengajamento (30s)** | **Ninguém faz isso como produto** |

## 3. Análise de mercado (30+ empresas)

### Fluxo de busca dos players
- **Lexical puro:** busca nativa (VTEX IS, Shopify S&D, Wix) — keyword matching, sem sinônimos/typos
- **Híbrido (lexical + semântico):** Algolia, Constructor, Bloomreach, Klevu — embeddings + regras de merchandising
- **Vetorial + RAG:** Algolia Agent Studio, Constructor AI Shopping Agent — LLM + retrieval grounded no catálogo
- **Conversacional full-page:** Alhena — NLU → query estruturada → vector search → MATCH/PARTIAL

### Como lidam com zero-results
- **Nativos:** página de "nada encontrado" (perda total)
- **Apps de busca:** fallback para categoria ampla (recuperação parcial, sem conversa)
- **Algolia Agent Studio:** "reduce zero-result dead ends" — guia para próximo passo (o mais próximo do nosso conceito, mas enterprise)
- **Alhena:** fallback para categoria/subcategoria + conversa (o mais completo, mas substitui a busca)

### Métricas que usam
- Zero-results rate (<5% alvo, <1% Doofinder clients)
- Search conversion rate (média indústria 4.63%)
- Revenue per search / search revenue attribution (>30%)
- CTR, search exit rate, search depth
- Conversational: conversion rate (12.3% vs 3.1%), AOV lift (+38% Tatcha), support deflection (86% Crocus)

### Lacunas do mercado (oportunidade 10x)
1. **Ninguém ataca o zero-results da busca NATIVA** — todos trocam ou aceitam
2. **Ninguém faz "Search Recovery" como produto** — recuperação conversacional pós-falha
3. **SMB/mid brasileiro desassistido** — enterprise tem Constructor/Algolia; SMB tem busca nativa ruim
4. **Regionalismos LATAM** — nenhum player global foca nisso
5. **Custo** — enterprise custa R$ 5-50K/mês; SMB precisa de solução a R$ 100-500/mês

## 4. Escopo do MVP (2-3 dias)

### Incluído (P0 — core path do fluxograma)
| ID | Requisito | Critério de aceite |
|---|---|---|
| REQ-001 | Pesquisa → agente entra como chat com 3+ produtos em <2s | 3+ produtos relevantes em <2s |
| REQ-002 | Cliente compra sugestão → ✅ sucesso (verde) | Checkout concluído |
| REQ-003 | Cliente responde pergunta → 3+ produtos + 1 explicação + 1 pergunta (loop) | Resposta gera produtos relevantes |
| REQ-004 | Não respondeu → esperar 30s → nova pergunta (loop de reengajamento) | Nova mensagem automática em 30s |
| REQ-005 | Loop esgotado → ❌ não adicionou nada (vermelho) | Fluxo encerra sem conversão |

### Fora do escopo (P1/P2 — cortado)
- Configuração de perguntas pelo lojista (REQ-006), contexto de sessão (REQ-007), explicação detalhada (REQ-008)

## 5. Arquitetura

```
Shopper → Searchbar (demo-storefront)
    ↓ query
Busca nativa Shopify (Storefront API)
    ↓ zero results / baixa relevância
Search Recovery Agent (Deco Studio / MCP App)
    ├── Tool: understand_intent (DeepSeek V4 Flash)
    │     → query estruturada (categoria, atributos, preço)
    ├── Tool: search_alternatives (Storefront API)
    │     → produtos MATCH/PARTIAL_MATCH
    └── Tool: converse (DeepSeek V4 Flash)
          → pergunta de refinamento / explicação
    ↓
Overlay conversacional (React, no demo-storefront)
    ↓ clique / add-to-cart
Venda recuperada
```

**Stack:** Deco Studio + MCP App (fork `decocms/mcp-app`) + demo-storefront (fork `deco-sites/demo-storefront`, Shopify) + DeepSeek V4 Flash via Fireworks (API key própria) + tools com UI (React + shadcn).

## 6. Métricas do MVP (para o pitch)

| Métrica | Baseline | Alvo | Fonte |
|---|---|---|---|
| Time-to-alternatives | N/A | **<2s** | evento no agente |
| Immediate purchase rate | 0% | 10%+ | evento checkout |
| Conversational conversion | 3.1% (sem IA) | 12%+ | benchmark Alhena |
| Recovery rate após timeout 30s | 0% | 5%+ | evento timeout |
| Zero-results recovery rate | 0% | 30%+ | evento no agente |
| Loop efficiency | N/A | <5 iterações/conversão | evento no agente |
| Custo por conversa | N/A | <R$0.05 | medição |

## 7. IA — avaliação e limites

| Aspecto | Threshold | Fallback |
|---|---|---|
| Query understanding | 80% correto em 10 queries teste | Busca lexical simples |
| Relevância das alternativas | 80% | Produtos da mesma categoria |
| **Alucinação** | **Zero produtos fora do catálogo** | **Nunca mostrar produto não retornado pela API** |
| Custo | <R$0.05/conversa | Cache + modelo barato |

## 8. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| LLM alucina produto | Grounded no catálogo (RAG); verificação contra índice |
| Latência >2s | DeepSeek Flash + cache + streaming |
| Custo da demo | Modelo barato + limite de tokens |
| Shopify demo falha | Dados seed locais como fallback |
| Escopo cresce | Vertical slice: só REQ-001/002/003 |
| Júri acha que é chatbot | Pitch foca em "Search Recovery", não chatbot |
| Sem loja real | demo-storefront com dados Shopify demo |

## 9. Plano de build (2-3 dias)

**Dia 1 (06/08):** fork demo-storefront + mcp-app; `bun run start` (conecta ao Studio); tool `search_recovery` (query → 3+ produtos relevantes em <2s)

**Dia 2 (07/08):** tool `converse` (pergunta → 3+ produtos + explicação + nova pergunta, loop); tool `reengage` (timeout 30s → nova mensagem); overlay chat no Searchbar; estados verde/vermelho

**Dia 3 (08/08):** aplicar em loja real (Matheus) se confirmado; gravar vídeo ≤5min (pesquisa → agente → compra ✅ / reengajamento → ❌); escrever descrição problema/solução/impacto

**09/08:** polimento + submissão 23h59

## 10. Open questions

- Matheus confirma acesso à loja real? (demo real vs demo-storefront)
- Shopify demo tem dados suficientes para demo de zero-results?
- Custo real do DeepSeek por conversa?
- Número máximo de iterações do loop de reengajamento (anti-spam)?

## 11. Veredito

**approved_with_caveats** — fluxo validado pelo fluxograma do Patrick (core path claro: pesquisa → agente → 3 ramos), solução diferenciada (Search Recovery é gap de mercado), escopo viável em 2-3 dias, integração com a Deco (júri conhece). Caveats: demo depende de dados Shopify demo; métricas de conversão são benchmark, não medição real em 3 dias.
