# Recova

**A segunda chance da sua busca.**

Projeto desenvolvido para o **Hackathon Agents for Commerce - Deco (2026)**.

A Recova é uma aplicação de recuperação de busca para e-commerce, composta por um agente MCP integrado a um storefront Shopify. Quando a busca nativa retorna zero resultados, a Recova interpreta o pedido, encontra alternativas no catálogo real e permite que o cliente refine a busca, adicione um produto ao carrinho ou siga para o checkout.

Ela atua sobre a busca existente: a loja não precisa substituir seu mecanismo de busca para testar a experiência.

## O problema

Buscas com termos vagos, erros de digitação ou regionalismos podem retornar zero resultados mesmo quando existem produtos relevantes no catálogo. Nesse ponto, uma jornada de alta intenção termina sem orientação, aumentando o abandono e a perda de oportunidades de venda.

## O que foi criado

O protótipo possui duas aplicações integradas:

1. **Agente MCP (`mcp-app`)** - servidor Bun com tools de recuperação, conversa, reengajamento, análise e instrumentação.
2. **Storefront de demonstração (`demo-storefront`)** - loja React/TanStack Start conectada ao Shopify, onde a experiência da Recova aparece abaixo da busca quando não há resultados.

O fluxo implementado é:

```text
Busca nativa retorna zero resultados
                |
                v
Recova consulta o catálogo Shopify e interpreta a intenção
                |
                v
Produtos reais + explicação + pergunta de refinamento
        |                    |                    |
        v                    v                    v
Ver produto          Refinar por texto/chip     Adicionar ao carrinho
                                                   ou abrir checkout
                |
                v
Eventos alimentam o dashboard do MVP
```

### Capacidades demonstráveis

- Acionamento automático somente em buscas com zero resultados.
- Produtos, imagens, preços e variantes vindos do catálogo Shopify da loja demo.
- Conversa com contexto e chips de refinamento.
- Fallback lexical quando o provedor de LLM não está configurado ou fica indisponível.
- Reengajamento após 60 segundos de inatividade, limitado a duas mensagens automáticas.
- Links para as páginas de produto.
- Adição real ao carrinho Shopify e redirecionamento para o checkout.
- Instrumentação de buscas, exposições, cliques, refinamentos, reengajamentos e checkout iniciado.
- Dashboard calculado a partir dos eventos persistidos localmente, sem dados seed.

> **Nota sobre atribuição:** no MVP, `purchase_attributed` é registrado depois que uma sugestão é adicionada com sucesso ao carrinho. Esse evento representa atribuição da ação à Recova, não confirmação de pagamento do pedido. O evento `checkout_started` identifica o início do checkout.

## Arquitetura

```text
Browser
  |
  v
demo-storefront (TanStack Start + React 19)
  |  loader server-side
  v
mcp-app (Bun + @decocms/runtime)
  |                    |
  v                    v
Shopify Storefront API  Ollama Cloud ou API OpenAI-compatível
catálogo/carrinho        interpretação opcional + fallback lexical
```

O browser não chama o servidor MCP diretamente. O loader server-side do storefront encaminha as chamadas para `http://localhost:3001/api/mcp`.

### Tools MCP

| Tool | Função |
|---|---|
| `search_recovery` | Cria a sessão e encontra alternativas no catálogo |
| `converse` | Refina a intenção mantendo o contexto da sessão |
| `reengage` | Envia até dois lembretes automáticos |
| `analyze_zero_results` | Agrupa causas e sugestões para buscas sem resultado |
| `track_event` | Registra eventos da experiência |
| `dashboard` | Agrega eventos em métricas do MVP |
| `hello` | Tool de exemplo preservada do template MCP |

## Como o júri pode testar

### Opção 1: sem chave de LLM

Esta é a forma mais rápida. **A `OLLAMA_API_KEY` não é obrigatória.** Sem uma chave, as tools usam o fallback lexical e o fluxo principal continua disponível: consulta ao catálogo, recomendações, refinamento, reengajamento, carrinho, checkout e instrumentação.

#### Pré-requisitos

- [Bun](https://bun.sh/) instalado.
- Node.js/npm para os scripts do storefront.
- Portas `3001` e `5173` livres.
- Acesso à internet para consultar o catálogo Shopify da demonstração.

#### 1. Inicie o agente MCP

```bash
cd mcp-app
bun install
bun run dev
```

O endpoint MCP ficará disponível em:

```text
http://localhost:3001/api/mcp
```

#### 2. Em outro terminal, inicie o storefront

```bash
cd demo-storefront
bun install
bun run dev
```

Abra `http://localhost:5173`.

#### 3. Valide o fluxo

1. Use a busca da loja com um pedido que não tenha correspondência direta, por exemplo: `tênis de corrida até 300`.
2. Confirme que a página de zero resultados exibe a Recova abaixo da busca.
3. Responda a pergunta usando um chip ou texto livre.
4. Abra um produto ou use **Adicionar ao carrinho**.
5. Use **Comprar** para validar o redirecionamento ao checkout Shopify.
6. Aguarde 60 segundos sem interagir para observar o reengajamento automático.

### Opção 2: experiência completa com LLM

Para habilitar interpretação e perguntas geradas pelo DeepSeek V4 Flash, crie `mcp-app/.env`:

```dotenv
OLLAMA_API_KEY=sua_chave_da_ollama
```

A chave é lida somente pelo servidor MCP e não deve ser commitada nem exposta no frontend. Quem estiver apenas avaliando o fluxo não precisa criar uma conta no Ollama, pois o fallback local é automático.

Também é possível usar um endpoint OpenAI-compatível:

```dotenv
OPENAI_API_KEY=sua_chave
OPENAI_BASE_URL=https://seu-endpoint/v1
OPENAI_MODEL=seu-modelo
```

A precedência é `OLLAMA_API_KEY` e, depois, `OPENAI_API_KEY`.

## Verificação técnica

```bash
# Agente MCP
cd mcp-app
bun run check
bun test
bun run build

# Storefront
cd ../demo-storefront
bun run typecheck
bun test
bun run build
```

## Persistência e limitações do MVP

- As sessões de conversa ficam em memória e expiram após 30 minutos.
- Os eventos do dashboard são persistidos em `mcp-app/data/events.json`.
- A integração atual aponta para a loja Shopify de demonstração `gimenesdevstore`.
- O gatilho implementado é zero-results; baixa relevância ainda não aciona a experiência no storefront.
- O dashboard mede eventos do funil, mas não recebe confirmação de pedido pago por webhook Shopify.
- O servidor MCP local usa a porta `3001`; o loader do storefront atualmente aponta para esse endereço.

## Estrutura do repositório

```text
recova/
|-- mcp-app/             # agente e servidor MCP + UIs das tools
|-- demo-storefront/     # storefront Shopify e experiência integrada
`-- docs/
    |-- PRD.md
    |-- FLUXOGRAMA.md
    `-- search-recovery-fluxograma.excalidraw
```

## Stack

- **Agente MCP:** Bun, TypeScript, `@decocms/runtime`, Zod e MCP Apps.
- **UI das tools:** React 19, Vite, Tailwind CSS e shadcn/ui.
- **Storefront:** TanStack Start, React 19, Deco e Cloudflare Workers.
- **Commerce:** Shopify Storefront API.
- **LLM opcional:** DeepSeek V4 Flash via Ollama Cloud ou endpoint OpenAI-compatível.
- **Testes:** Bun Test e Testing Library.

## Branding

- **Nome:** Recova.
- **Tagline:** "A segunda chance da sua busca".
- **Cores:** Azul Recova `#155EEF`, Azul Profundo `#102A43`, Laranja Resgate `#F97316` e Verde `#16A34A`.
- **Tipografia:** Manrope para display e Inter para corpo.

## Status

Este repositório é um protótipo funcional de hackathon. Metas de conversão, custos por conversa, projeções de receita e comparações de mercado ainda precisam de validação em operação real e, por isso, não são apresentadas como resultados comprovados.

---

Projeto desenvolvido durante o Hackathon Agents for Commerce - Deco, de 1 a 9 de agosto de 2026.
