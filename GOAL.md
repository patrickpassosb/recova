# GOAL — Missão final: CodeRabbit + Fontes + Dashboard + Loop + Demo (Dinosaurus Team 4th)

**Deadline:** HOJE 09/08 23h59 (hackathon Agents for Commerce Deco 2026).
**Modo:** autonomia total, loop até concluir TUDO. Não pare até cada item abaixo estar feito, testado e verificado. Se algo falhar, tente de novo com abordagem diferente. Ao final, faça o relatório completo.

**Contexto:** o repo é `/root/search-recovery` (remote: `https://github.com/patrickpassosb/recova.git`, branch `main`). O Gabriel está fazendo a landing page — NÃO mexer nisso. O vault está em `/root/obsidian-vault/`. O dossiê de fontes está em `/root/obsidian-vault/Hackathons/Agents for Commerce Deco 2026/Gabriel - Trabalho 08-08/Arquivos padrão/dossie_zero_results.md`.

---

## FASE 0 — Pesquisa (ANTES de qualquer instalação)

Pesquise e documente (no relatório final):
1. Como instalar Chromium/Chrome headless no Ubuntu 24.04 SEM snap (Playwright `npx playwright install chromium` vs .deb do Google Chrome)
2. Como gravar vídeo de fluxo web headless (Playwright `page.video()` vs Xvfb + ffmpeg x11grab)
3. Como converter WebM → MP4 com ffmpeg
4. Decida a abordagem e justifique

## FASE A — Corrigir as 7 sugestões do CodeRabbit (PR #1)

1. `mcp-app/api/lib/__tests__/llm.test.ts`: detectar `OPENAI_API_KEY` também (não só `OLLAMA_API_KEY`) — os testes de rede devem rodar com QUALQUER uma das chaves
2. `mcp-app/api/lib/__tests__/sessions.test.ts`: limpar sessões criadas nos testes (marcar expiradas + `pruneSessions()` no afterEach) — hoje vazam no Map do módulo
3. `mcp-app/api/lib/llm.ts`: validar `LLM_TIMEOUT_MS` — rejeitar valores negativos/overflow (usar fallback 3000 se não for finito e positivo)
4. `mcp-app/api/tools/__tests__/analyzeZeroResults.test.ts`: assertar `cause` E `suggested_fix` do fixture (hoje o teste passa mesmo se o LLM for ignorado)
5. `mcp-app/api/tools/__tests__/converse.test.ts`: adicionar 2+ produtos ao `TEST_CATALOG` (7 produtos não satisfazem o contrato no-repeat de 3+ em 3 iterações) e assertar que os IDs não se repetem entre iterações
6. `mcp-app/api/tools/__tests__/searchRecovery.test.ts`: assertar que respostas consecutivas NÃO compartilham product IDs
7. `README.md`: corrigir os números da conta de receita (ver Fase B — os números corretos são: 40.000 × 12% × 3,1% × R$120 × 365 = **R$6,5M/ano em risco**; 10% recuperado = **R$652 mil/ano**; custo anual = 4.800 × 365 × 10% × R$0,05 = **R$8.760**)

## FASE B — Fontes reais para o README (tudo com fonte)

A tabela do README diz "todas citáveis" mas 3 linhas não têm fonte rastreável (40k buscas/dia, 3,1% conversão, AOV R$120). Corrija:

1. **Prioridade 1 — fontes do dossiê do Gabriel** (já têm URL, ano, metodologia):
   - Taxa de zero-results 12%: SearchMind/Barilliance (citado via Doofinder/Algolia) e Bloomreach 12-20% (https://www.bloomreach.com/en/blog/how-to-fix-zero-search-results-in-ecommerce)
   - Ticket médio: ABComm 2025-2026 R$564,96 (https://edrone.me/br/blog/dados-ecommerce-brasil) — se usar R$120, justifique como premissa SMB conservadora OU use o dado da ABComm
   - Outras fontes úteis no dossiê: Nuvemshop NuvemCommerce 2026, VTEX Fast Shop case, Baymard, Shopify docs
2. **Prioridade 2 — busca web** para: 40k buscas/dia em loja de alto volume, 3,1% conversão base de busca, AOV SMB brasileiro. Use fontes com URL verificável.
3. **Regra ABSOLUTA:** nunca inventar fonte. Se não achar fonte para um número, marcar como "premissa interna" com justificativa clara na tabela.
4. Atualize a tabela do README com coluna de fonte real (org + URL + ano) e ajuste o título ("todas citáveis" só se for verdade).

## FASE C — Dashboard 100% dados reais (eventos do brand book)

O brand book está em `/root/obsidian-vault/Hackathons/Agents for Commerce Deco 2026/Gabriel - Trabalho 08-08/Arquivos padrão/brand_book.md`. Use os eventos e métricas DELE:

1. **Eventos mínimos (seção 74):** `search_performed`, `search_zero_results`, `search_low_relevance`, `recova_exposed`, `recova_product_viewed`, `recova_product_clicked`, `recova_refinement_started`, `recova_reengaged`, `recova_closed`, `purchase_attributed`
2. **Métricas (seção 75):** receita atribuída à Recova, taxa de recuperação de sessões expostas, conversão de usuários expostos vs controle, receita por busca falha, taxa de clique em alternativas, taxa de refinamento, taxa de reengajamento, tempo até interação
3. **Schemas (seção 69):** `recova_exposed` (store_id, query_hash, trigger, timestamp, session_id) e `recova_interaction` (interaction_type: product_click|refinement|close|reengagement, products_shown, timestamp)
4. **Implementação:**
   - Instrumentar o overlay do demo-storefront (`src/components/search/SearchRecoveryOverlay.tsx` e afins) para emitir os eventos reais
   - Nova tool/resource no mcp-app: `api/tools/dashboard.ts` + `web/tools/dashboard/` (UI React estilo das tools existentes)
   - Customização de cores/logo (white-label) reutilizando o tema existente
   - **SEM seed, SEM badge, SEM dados falsos** — só eventos reais
5. **Persistência:** decida onde os eventos são armazenados (em memória com TTL? arquivo JSON? SQLite?) — justifique. Para o MVP do hackathon, algo simples e que sobreviva ao restart do mcp-app é aceitável.

## FASE D — LOOP de bugs e melhorias (crítico)

Depois de A+B+C, rode em loop:
1. Revise o código inteiro (mcp-app + demo-storefront)
2. Teste o fluxo completo ao vivo: suba `bun run dev` (mcp-app :3001) e `npm run dev` (demo-storefront :5173) — zero-results → overlay → conversa → chips → comprar → carrinho real → dashboard
3. Procure bugs, inconsistências, melhorias de UX/código
4. Cada iteração: implemente → teste (`bun test` mcp-app, `bun run check`, `npm run typecheck` demo-storefront) → commit → push
5. Só pare quando não encontrar mais nada (ou reporte o que ficou com prioridade)

## FASE E — Demo gravada (Opção B — você faz tudo)

1. Instale o Chromium na VPS (após a pesquisa da Fase 0)
2. Suba mcp-app (:3001) + demo-storefront (:5173)
3. **Gere dados reais com os DOIS métodos:**
   - **Playwright:** navegue o storefront de verdade — buscas zero-results variadas (ex: "tenis corrida trail feminino impermeavel azul 39", "hhhh", "camisa do flamengo", "caneca termica", "sticker programacao") → converse com o agente (chips e texto) → compre produtos → feche
   - **Tools MCP:** chamadas diretas `search_recovery` + `converse` + `reengage` em loop (10-20 sessões) para volume rápido
4. Grave o fluxo real com Playwright `page.video()` (ou a abordagem decidida na Fase 0): busca zero-results → overlay → conversa → chips → comprar → carrinho → **dashboard com os dados reais gerados**
5. Converta para MP4 com ffmpeg (H.264, ≤100MB, ≤3min)
6. Deixe o arquivo pronto em `/root/recova-demo.mp4` (o Patrick vai baixar depois)

## FASE F — Commit e push (por fase)

- **Commit + push a cada fase** (A, B, C separados; D e E em commits atômicos)
- Mensagens em português, descritivas
- Resolva conflitos mantendo as duas mudanças
- NUNCA commitar chaves/segredos (`.env` fica fora)

## Relatório final

Ao terminar, imprima:
- Fase 0: decisão da pesquisa (instalação + gravação + conversão)
- Fase A: cada correção aplicada (arquivo + o que mudou)
- Fase B: fontes encontradas (org + URL + ano) e o que ficou como premissa interna
- Fase C: dashboard implementado (eventos, métricas, persistência, arquivos)
- Fase D: bugs/melhorias encontrados e corrigidos (lista)
- Fase E: demo gravada (caminho do MP4, duração, tamanho, o que mostra)
- Fase F: commits e push (hashes)
- Pendências com prioridade, se houver
