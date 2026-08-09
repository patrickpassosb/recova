# GOAL — Loop visual: Kimi K2.7 Code vê, melhora o design, regrava a demo (Dinosaurus Team 4th)

**Deadline:** HOJE 09/08 23h59 (hackathon Agents for Commerce Deco 2026).
**Modo:** autonomia total, LOOP VISUAL até o design ser aprovado pelo Kimi K2.7 Code (nota ≥ 8/10) e a demo ficar boa. Não pare antes.

**Contexto:** repo `/root/search-recovery` (remote `patrickpassosb/recova`, main, commit `b91c7ca`). O Gabriel faz a landing page — NÃO mexer. O Patrick reclamou: **a demo de 16s está ruim e ele não viu a aplicação**. Objetivo: deixar a aplicação com design bonito (brand book Recova) e criar uma demo de qualidade.

**Ferramentas já prontas na VPS:**
- Playwright + Chromium instalados (`~/.cache/ms-playwright/`)
- Skill `web-flow-demo-recording` (software-development) — siga-o para gravar
- Kimi K2.7 Code com visão via Aperture: `http://ai.tail492ce8.ts.net/v1/chat/completions`, model `ollama-cloud/kimi-k2.7-code` (imagens base64 em `image_url`)
- Brand book: `/root/obsidian-vault/Hackathons/Agents for Commerce Deco 2026/Gabriel - Trabalho 08-08/Arquivos padrão/brand_book.md` (cores: azul #155EEF, navy #102A43, laranja #F97316, verde #16A34A, grafite #1D2939, fundo #F4F7FA; Manrope + Inter)

---

## FASE 1 — Subir a aplicação

1. `cd /root/search-recovery/mcp-app && nohup bun run dev:api > /tmp/mcp.log 2>&1 &` (porta 3001)
2. `cd /root/search-recovery/demo-storefront && nohup npm run dev > /tmp/storefront.log 2>&1 &` (porta 5173)
3. Verifique com curl que ambos respondem antes de continuar.

## FASE 2 — Screenshots da aplicação real (Playwright)

Crie um scratch dir (`/tmp/demo-run`), instale playwright e tire screenshots de TODAS as telas:
1. Home da loja (`http://localhost:5173/`)
2. Busca com resultados (`/s?q=tenis`)
3. Busca zero-results com overlay Recova aberto (`/s?q=tenis corrida trail feminino impermeavel azul 39`) — espere o overlay carregar
4. Overlay com conversa (clique num chip, ex: "Casual") — mostre a resposta da LLM
5. Overlay com carrinho (clique "Comprar" — estado verde)
6. Dashboard (`http://localhost:3001/` ou a rota do dashboard no mcp-app — verifique em `web/router.tsx`)

Salve em `/tmp/demo-run/shots/*.png` (viewport 1280x800, fullPage onde fizer sentido).

## FASE 3 — Kimi K2.7 Code avalia o design (LOOP)

Para cada rodada do loop:
1. Envie TODOS os screenshots para o Kimi K2.7 Code via Aperture com prompt estruturado:
   - Avalie: fidelidade ao brand book Recova (cores #155EEF/#102A43/#F97316, Manrope/Inter, logo), hierarquia visual, contraste, legibilidade, espaçamento, UX do overlay (chips, carrossel, botões), estado do dashboard
   - Nota 0-10 por tela + lista de correções específicas (ex: "header muito escuro, aumentar contraste do texto", "chips pequenos demais", "carrossel cortado")
2. Aplique as correções no código (demo-storefront + mcp-app/web)
3. Re-tire screenshots e re-envie ao Kimi
4. **Repita até o Kimi dar nota ≥ 8/10 em todas as telas** (ou convergir — 2 rodadas sem melhoria = pare e reporte)

Regras de design (brand book):
- Cores exatas do brand book; Manrope para display, Inter para corpo
- Overlay inline (não pop-up), carrossel horizontal com scroll-snap
- 2 botões por produto (Comprar/Adicionar ao carrinho)
- Chips de refinamento dinâmicos (já implementados)
- NUNCA inventar cor/atributo de produto (anti-alucinação)
- Testes: `bun test` (mcp-app), `bun run check`, `npm run typecheck` (demo-storefront) — verdes a cada iteração

## FASE 4 — Regravar a demo (skill web-flow-demo-recording)

Depois do design aprovado:
1. Siga o skill `web-flow-demo-recording` (Playwright → WebM → ffmpeg MP4)
2. Roteiro da demo (fluxo completo, ~60-90s):
   - Home da loja (2s)
   - Busca zero-results → overlay Recova abre (5s)
   - Conversa com o agente: clique num chip → resposta da LLM (10s)
   - Carrossel de produtos + clique "Comprar" → carrinho real (10s)
   - Dashboard com os dados reais gerados (10s)
   - Fechamento (2s)
3. Gere dados reais antes/durante: rode o fluxo N vezes (Playwright + tools MCP) para o dashboard ter volume
4. Converta para MP4 (H.264, ≤100MB, ≤3min) → `/root/recova-demo.mp4`
5. Verifique com ffprobe (duração/tamanho) e confirme que o fluxo gerou dados reais (dashboard com eventos)

## FASE 5 — Commit e push

- Commit + push por iteração de design (mensagens em português)
- NUNCA commitar chaves/segredos

## Relatório final

- Notas do Kimi por rodada (0-10) e o que mudou entre rodadas
- Screenshots finais (caminho)
- Demo: caminho, duração, tamanho, o que mostra
- Commits pushados (hashes)
- Pendências com prioridade
