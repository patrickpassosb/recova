# Search Recovery Agent

**Hackathon Agents for Commerce — Deco (2026)**

Agente de IA que recupera vendas quando a busca nativa da loja falha. Em vez de uma página de "nenhum resultado encontrado", o agente entra como chat, mostra produtos relevantes em menos de 2 segundos e guia o cliente até a compra.

## O problema

- **12–15%** das buscas em lojas online retornam zero resultados (LATAM lidera por regionalismos)
- Quando o cliente encontra zero resultados, **a conversão cai 87%** e **12% dos compradores vão ao concorrente**
- **63% dos lojistas estão insatisfeitos** com a busca nativa da plataforma
- Usuários de busca **convertem 3–5x mais** que navegadores — é o canal de maior intenção de compra, e ele está vazando

## A solução

Camada fina de IA que atua **sobre** a busca nativa (não substitui):

```
Pesquisa do produto → busca falha (zero results / baixa relevância)
    ↓
Agente de IA entra como chat: 3+ produtos relevantes em <2s
    ├── Cliente comprou → ✅ SUCESSO (verde)
    ├── Cliente respondeu → 3+ produtos + explicação + nova pergunta (loop)
    └── Não respondeu em 30s → nova pergunta (reengajamento) → ❌ sem conversão (vermelho)
```

### Diferenciação

| Player | Abordagem | Gap que exploramos |
|---|---|---|
| Constructor, Algolia, Bloomreach | Substituem a busca inteira (enterprise, caro) | Não atacam o zero-results da busca nativa |
| Alhena | Busca conversacional full-page (substitui a experiência) | Não é camada de recuperação |
| Doofinder, Klevu, Searchspring | Apps de busca (SMB/mid) | Trocar ≠ consertar |
| VTEX IS, Shopify S&D | Busca nativa (grátis) | Não conversam, não recuperam |
| **Nós** | **Search Recovery: entra SÓ quando falha, com loop de reengajamento** | **Ninguém faz isso como produto** |

## Estrutura do repo

```
search-recovery-agent/
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
- **LLM**: DeepSeek V4 Flash (via Aperture, `ai.tail492ce8.ts.net/v1`) — custo < R$0.05/conversa

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

## Ferramentas usadas

- Claude Code / agentes de IA (ferramenta livre conforme regras do evento)
- Deco Studio (créditos) + MCP App + demo-storefront
- DeepSeek V4 Flash
- Bun, TanStack Start, React 19, Tailwind v4

---

Projeto desenvolvido durante o Hackathon Agents for Commerce (Deco), 01–09/08/2026.
