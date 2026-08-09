# GOAL — Missão completa: Transcrição + Consertos + Vault (Dinosaurus Team 4th)

**Deadline:** HOJE 09/08 23h59 (hackathon Agents for Commerce Deco 2026).
**Modo:** autonomia total, loop até concluir TUDO. Não pare até cada item abaixo estar feito e verificado. Se algo falhar, tente de novo com abordagem diferente. Ao final, faça o relatório.

## FASE 1 — Transcrever a reunião (Groq Whisper)

Arquivo: `/root/meeting.zip` (gravação Discord, 2 faixas FLAC Audacity, ~2h17min total).

1. Extraia o zip em `/root/meeting/`
2. Converta as 2 faixas para MP3 mono 16kHz (ffmpeg)
3. Divida em chunks de 10 minutos (<25MB cada, limite da Groq)
4. Transcreva com Groq `whisper-large-v3-turbo`, `language=pt`:
   - Endpoint: `https://api.groq.com/openai/v1/audio/transcriptions`
   - Auth: `GROQ_API_KEY` (em `~/.hermes/.env`)
   - 3 workers paralelos; retry com backoff em rate limit
5. Monte `/root/meeting-transcricao.txt` com timestamps aproximados por chunk
6. Copie para o vault: `/root/obsidian-vault/Hackathons/Agents for Commerce Deco 2026/23 - Reunião 09-08 Transcrição.md` (frontmatter: `type: Note`, `title`, `updated: "2026-08-09"`, `tags: [recova, hackathon, reuniao]`)

## FASE 2 — Extrair TODOS os pontos de ação da transcrição

Leia a transcrição completa e liste TODOS os pedidos do Patrick sobre o produto Recova. Exemplos prováveis (verifique na transcrição):
- Overlay não deve ser pop-up; integrado à página (embaixo da barra de busca)
- Aparecer automaticamente se não houver recomendações ao digitar (~10s); no Enter aparecer na tela principal
- Só acionar quando a busca não encontra produto
- Produtos clicáveis (ir para página do produto) + Comprar adiciona ao carrinho de verdade
- Remover textos auto-elogiosos ("A Recova vai recuperar uma venda que a busca nativa teria perdido")
- Som de alerta no reengajamento (30s inatividade)
- "Powered by Recova" clicável → landing page
- Verificar senha da loja Shopify (gimenesdevstore) se necessário
- Filtros por cor/atributos reais do catálogo (não inventar cores)
- Anote o que o Gabriel disse sobre vídeos/slides (Fal AI, Google Veo, custos) como contexto (não agir)

## FASE 3 — Consertar o código (repo /root/search-recovery)

Aplique TODOS os pontos de ação:

- **demo-storefront** (TanStack Start + React 19 + Shopify):
  - `src/components/search/SearchRecoveryOverlay.tsx` — overlay, chips, produtos clicáveis, som, textos
  - `src/components/search/SearchResult.tsx` e `SearchModal.tsx` — disparo do agente
  - `src/loaders/searchRecovery.ts` — contrato
- **mcp-app** (Bun + MCP tools):
  - `api/tools/searchRecovery.ts`, `converse.ts`, `reengage.ts`
  - `api/lib/llm.ts` — API oficial Ollama Cloud (`https://ollama.com/v1/chat/completions`, model `deepseek-v4-flash:preview`, `OLLAMA_API_KEY` no `.env` do mcp-app; NUNCA commitar a chave)
  - `api/lib/shopify.ts` — busca lexical, categorias dinâmicas

Regras: nunca inventar produto/atributo; chips dinâmicos do catálogo; chat nunca encerra sozinho; Recova só no Enter; verifique com `bun run check` e `npm run typecheck`; teste fluxo completo (`bun run dev` mcp-app :3001, `npm run dev` demo-storefront :5173) — zero-results → overlay → conversa → chips → comprar → carrinho real.

## FASE 4 — Commit e push

1. Commit em português; 2. Push para `main` em `patrickpassosb/recova` (remote pode estar em `/root/search-recovery` — se antigo, `git remote set-url origin https://github.com/patrickpassosb/recova.git`); 3. Resolva conflitos mantendo as duas mudanças.

## FASE 5 — Atualizar o vault

1. Nota da reunião (Fase 1 passo 6); 2. Atualizar `22 - Sessão 08-08 Redesign Overlay Recova.md` com decisões de hoje; 3. Criar resumo de ações e o que foi consertado.

## LOOP (crítico)

Depois de concluir tudo, revise a transcrição UMA VEZ MAIS e verifique se NENHUM ponto de ação ficou de fora. Se faltou algo, implemente. Repita até esgotar todos os pontos. Só então entregue o relatório final:
- Chunks transcritos / pontos de ação encontrados / o que foi consertado (arquivos) / testes / commit hash / push status / pendências com prioridade.
