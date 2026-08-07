# BRIEF — Search Recovery Agent (Build Contract)

**Projeto:** Search Recovery Agent — Hackathon Agents for Commerce (Deco)
**Deadline:** 09/08/2026 23h59
**Repo:** `patrickpassosb/search-recovery-agent` (público)
**Colaborador com push:** `isaacnewtonagent` (este agente)

Este documento é o contrato do build. Siga-o fielmente. Todo o código, README e commits em **português**.

---

## 1. Contexto

Hackathon da Deco (decocms.com) — agentes de IA para e-commerce. Critérios do júri:
1. **Impacto no negócio** — métrica clara (mais receita ou menos custo) em operação real de alto volume
2. **Execução técnica** — o agente realmente funciona
3. **Originalidade** — ângulo novo vs. mercado
4. **Aplicabilidade real** — roda em operação real
5. **Apresentação** — pitch + vídeo demo ≤5 min

Entregáveis: repo público + vídeo demo ≤5min + descrição problema/solução/impacto.

## 2. Problema (com números citáveis)

- **12–15%** das buscas em lojas online retornam zero resultados (SearchMind: 12.5% global, LATAM lidera por regionalismos)
- Conversão cai **87%** quando o usuário encontra zero results
- **63%** dos lojistas insatisfeitos com a busca nativa (Doofinder, 10K+ lojas)
- **12%** dos compradores vão ao concorrente após busca falha
- Usuários de busca convertem **3–5x** mais que navegadores (ExpertRec)
- Shoppers que engajam com IA convertem **12.3% vs 3.1%** (Alhena/Netguru)

## 3. Solução — jornada (FLUXOGRAMA)

```
PESQUISA DO PRODUTO NA FAIXA (busca nativa do demo-storefront)
  ↓
AGENTE DE IA ENTRA COMO CHAT — automaticamente mostra 3+ produtos relevantes em <2s
  ├── CLIENTE COMPROU UMA DAS SUGESTÕES → ✅ SUCESSO (estado VERDE)
  ├── CLIENTE RESPONDE À PERGUNTA
  │     ↓
  │     AGENTE RESPONDE: 3+ produtos relevantes à resposta + 1 explicação do porquê + 1 nova pergunta
  │     ↓ (LOOP ↺ volta ao "cliente responde")
  └── NÃO RESPONDEU A NENHUMA PERGUNTA NEM ADICIONOU AO CARRINHO
        ↓
        ESPERAR 30 SEGUNDOS E ENVIAR MAIS UMA MENSAGEM DE PERGUNTA
        ↓ (LOOP ↺ de reengajamento, máx 2 tentativas)
        ❌ NÃO ADICIONOU NADA NO CARRINHO (estado VERMELHO)
```

Anotação do criador (funcionalidade de configuração): "uma pergunta ou 3 respostas pré-definidas — opção de escrita manual pelo lojista". Implementar como configuração simples no agente (constantes/config), NÃO UI de admin completa.

## 4. Arquitetura

### mcp-app/ (O AGENTE — tools MCP)
- Runtime: Bun + `@decocms/runtime` — MCP server em `http://localhost:3001/api/mcp`
- Tools em `api/tools/*.ts` usando `createTool` + zod (ver `api/tools/hello.ts` como referência de padrão)
- UIs em `web/tools/<nome>/` (React + shadcn) + resources em `api/resources/`
- Registrar tools em `api/tools/index.ts`

### demo-storefront/ (O AMBIENTE — overlay na busca)
- Stack: TanStack Start + React 19 + Cloudflare Workers + Shopify (loja demo `gimenesdevstore` já configurada em `.deco/blocks/deco-shopify.json`)
- Busca existente: `src/loaders/searchSuggestions.ts` + `src/components/search/Searchbar/`
- **Overlay a criar:** quando a busca retorna zero resultados (ou baixa relevância), abre o chat do agente sobre o searchbar

## 5. Tools MCP a implementar (4)

### T1 — `search_recovery` (P0, coração)
- **Input:** `query` (texto livre do cliente)
- **Lógica:** usa LLM (DeepSeek V4 Flash) para entender a intenção (categoria, atributos, preço, sinônimos, typos) → busca no catálogo Shopify (via Storefront API ou loader existente) → retorna 3+ produtos relevantes com score MATCH/PARTIAL
- **Output:** `{ products: [{id,title,price,image,score,match_type}], explanation: string, follow_up_question: string }`
- **Critério:** retorna em <2s; 3+ produtos; explicação do porquê; pergunta de refinamento

### T2 — `converse` (P0, loop)
- **Input:** `{ session_id, user_response }`
- **Lógica:** interpreta a resposta do cliente, refina a busca (novos filtros/sinônimos), retorna 3+ produtos + explicação + nova pergunta
- **Output:** mesmo shape de T1
- **Critério:** contexto da sessão preservado entre iterações; produtos relevantes à resposta

### T3 — `reengage` (P1, timeout 30s)
- **Input:** `{ session_id }`
- **Lógica:** após 30s sem ação do cliente, envia nova mensagem de pergunta (máx 2 tentativas, sem spam)
- **Output:** `{ message: string, attempt: 1|2 }`
- **Critério:** sem spam (máx 2); mensagem diferente a cada tentativa

### T4 — `analyze_zero_results` (P1, C1 — correção cirúrgica)
- **Input:** `{ logs?: SearchLog[] }` (ou usa dados de demonstração se não houver logs)
- **Lógica:** analisa termos de busca com zero resultados, agrupa por causa (typo, sinônimo, produto não catalogado, regionalismo), sugere correções
- **Output:** `{ report: [{term, volume, cause, suggested_fix}], summary }`
- **Critério:** relatório com top 10 termos, causa classificada, sugestão de correção

## 6. LLM (DeepSeek V4 Flash)

- **Endpoint:** `http://ai.tail492ce8.ts.net/v1` (Aperture via tailnet — acessível da VPS)
- **Auth:** `Authorization: Bearer not-required`
- **Model:** `ollama-cloud/deepseek-v4-flash:0731` (ou `accounts/fireworks/models/deepseek-v4-flash-0731`)
- **Uso:** entender intenção, gerar explicações, gerar perguntas. Chamadas curtas (max_tokens ~500-800), com fallback para busca lexical simples se o LLM falhar
- **Custo alvo:** < R$0.05 por conversa

Exemplo de chamada:
```bash
curl -s http://ai.tail492ce8.ts.net/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer not-required" \
  -d '{"model":"ollama-cloud/deepseek-v4-flash:0731","messages":[{"role":"user","content":"..."}]}'
```

## 7. Critérios de aceite (verificação por comando)

### mcp-app
- [ ] `bun run dev` sobe sem erro (server MCP em :3001/api/mcp)
- [ ] `curl http://localhost:3001/api/mcp` responde (handshake MCP)
- [ ] T1 `search_recovery` com query "tênis de corrida até 300" retorna 3+ produtos com preço ≤300 e categoria correta
- [ ] T1 retorna em <2s (medir com `time curl`)
- [ ] T2 `converse` mantém contexto (2+ iterações com respostas diferentes)
- [ ] T3 `reengage` respeita máx 2 tentativas
- [ ] T4 `analyze_zero_results` gera relatório com causas classificadas
- [ ] Nenhum produto fora do catálogo (zero alucinação — grounded na Storefront API)

### demo-storefront
- [ ] `bun run dev` sobe sem erro
- [ ] Busca com termo sem resultado abre o overlay do agente automaticamente
- [ ] Overlay mostra 3+ produtos em <2s
- [ ] Estados ✅ verde (comprou) e ❌ vermelho (desistiu) funcionam
- [ ] Loop de conversa funciona (resposta → novos produtos + pergunta)

## 8. Stack e comandos

- **Bun** (instalado via `curl -fsSL https://bun.sh/install | bash`)
- mcp-app: `bun install && bun run dev`
- demo-storefront: `bun install && bun run dev`
- Tipos: `bunx tsc --noEmit` (mcp-app tem `bun run check`)
- Lint: `bun run lint` (biome)

## 9. Boundaries (o que PODE tocar)

- `mcp-app/api/tools/` — criar/editar tools
- `mcp-app/api/tools/index.ts` — registrar tools
- `mcp-app/api/resources/` — resources das UIs
- `mcp-app/web/tools/` — UIs React das tools
- `demo-storefront/src/components/search/` — overlay conversacional
- `demo-storefront/src/loaders/` — loaders de busca se necessário
- `docs/`, `README.md` — documentação
- `package.json` dos dois apps — adicionar dependências se necessário (ex.: cliente HTTP)

## 10. STOP CONDITIONS (parar e reportar, NÃO improvisar)

1. **Não usar a conta `patrickpassosb`** para nada (push, auth, API) — push APENAS como `isaacnewtonagent` (colaborador)
2. **Não adicionar/alterar credenciais** — o `adminAccessToken` do Shopify está criptografado (resolve na plataforma Deco); NÃO tentar descriptografar; a busca funciona com o `storefrontAccessToken` (texto puro)
3. **Não modificar código do upstream fora das boundaries** acima
4. **Não inventar APIs** — se uma integração não existe no código, usar fallback (dados de demonstração locais)
5. **Se o `bun install` falhar** por conflito de versões — reportar o erro exato e tentar `--force` uma vez; se persistir, parar e reportar
6. **Se o LLM do Aperture ficar inacessível** — usar fallback lexical (busca direta por termo) e reportar
7. **Nunca declarar done sem evidência** — mostrar output real de comando/teste
8. **Se precisar de decisão fora deste BRIEF** — parar e reportar com a pergunta exata

## 11. Entregáveis finais

1. Código funcional commitado no repo (main)
2. `README.md` atualizado com instruções de como rodar
3. Log de marcos (commits atômicos com mensagens claras em PT)
4. Lista de comandos de verificação que passaram
5. Nenhum segredo/credencial nova no repo

## 12. Notas técnicas importantes

- O demo-storefront usa `gimenesdevstore` (loja Shopify demo do upstream) — produtos de exemplo já existem
- A busca Shopify é via `@decocms/apps-shopify` (ProductList loader) — ver `src/loaders/searchSuggestions.ts` para o padrão
- O mcp-app tem `bun start` (script `scripts/start.ts`) que faz `deco link` — **NÃO usar** (requer login do Patrick); usar `bun run dev` direto
- Se o Vite build do mcp-app demorar, `bun run dev:api` roda só o server MCP (tools sem UI) — suficiente para testar a lógica
- Prioridade: **lógica das tools primeiro** (T1-T4), UIs depois, overlay por último
- Manter commits pequenos e frequentes (a cada tool/marco)
