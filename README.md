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

> ⚠️ O overlay do storefront depende do MCP server rodando na mesma máquina
> (o loader proxy chama `http://localhost:3001/api/mcp`). Suba o mcp-app
> primeiro.

```bash
# 1) MCP App (o agente) — servidor MCP em http://localhost:3001/api/mcp
cd mcp-app
bun install
bun run dev:api        # só o servidor MCP (recomendado para testar as tools)
# ou: bun run dev      # servidor + build da UI (Vite)

# 2) Demo storefront (o ambiente) — overlay conversacional na busca
cd demo-storefront
bun install
bun run dev            # storefront em http://localhost:5173
```

### Testar o agente

```bash
# Listar as 4 tools MCP
curl -X POST http://localhost:3001/api/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# T1 — search_recovery (3+ produtos em <2s)
curl -X POST http://localhost:3001/api/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_recovery","arguments":{"query":"tênis de corrida até 300"}}}'

# T2 — converse (loop com contexto) / T3 — reengage (máx 2) / T4 — analyze_zero_results
# (use o session_id retornado pelo search_recovery)
```

### Testar o overlay no storefront

Abra `http://localhost:5173/s?q=<termo-sem-resultado>` (ex.: `?q=xyzabc`) — o
agente entra automaticamente como chat com 3+ produtos. Responda no chat para
ver o loop, clique em **Comprar** para o estado ✅ verde, ou não faça nada por
30s (2x) para ver o reengajamento e o estado ❌ vermelho.

## Verificação (comandos que passaram)

| Critério | Comando | Resultado |
|---|---|---|
| 4 tools no MCP | `tools/list` | `search_recovery`, `converse`, `reengage`, `analyze_zero_results` |
| T1 <2s, 3+ produtos ≤R$300 | `time curl` + `search_recovery("tênis de corrida até 300")` | 0.9s, 3 produtos (High Top Canvas Shoes R$40, Sublimation Flip Flops R$10, Women's Slides R$25) |
| T2 contexto | `converse` 2+ iterações | sessão mantida, produtos relevantes a cada resposta |
| T3 máx 2 | `reengage` 3x | tentativa 1 → 2 → exhausted |
| T4 relatório | `analyze_zero_results` | top 10 termos com causa (typo/sinônimo/não catalogado/regionalismo) |
| Storefront sobe | `bun run dev` | Vite :5173, HTTP 200 |
| Overlay zero-results | `/s?q=xyzabc` | abre automaticamente com chat do agente |
| Estados | Comprar / timeout 30s×2 | ✅ verde / ❌ vermelho |

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
