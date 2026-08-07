# GOAL — Contrato do /goal (rodar no Hermes, profile software-engineer)

> Colar este contrato no `/goal` do Hermes na VPS (profile `software-engineer`).
> O Hermes também deve ler: `/root/obsidian-vault/Hackathons/Agents for Commerce Deco 2026/18 - PRD Search Recovery Agent.md` e `19 - Fluxograma Search Recovery.md`, e `/root/search-recovery/BRIEF.md`.

---

## Outcome

Implementar o **Search Recovery Agent** funcional no repo `/root/search-recovery`:
- **mcp-app**: 4 tools MCP — `search_recovery`, `converse`, `reengage`, `analyze_zero_results` (padrão de `api/tools/hello.ts` com `createTool` + zod), registradas em `api/tools/index.ts`
- **demo-storefront**: overlay conversacional na busca que abre automaticamente quando a busca retorna zero resultados, seguindo o fluxograma (agente entra com 3+ produtos <2s → cliente comprou ✅ / respondeu → loop / 30s → reengage → ❌)
- README.md atualizado em português com instruções de como rodar

## Verification (evidência concreta — mostrar output real de comandos)

1. `bun run dev:api` no mcp-app sobe e `curl -X POST http://localhost:3001/api/mcp` com `tools/list` lista as 4 tools
2. `time curl` na tool `search_recovery` com query "tênis de corrida até 300" → 3+ produtos, preço ≤300, <2s
3. `converse` com 2+ iterações mantém contexto
4. `reengage` respeita máx 2 tentativas
5. `analyze_zero_results` gera relatório com causas classificadas
6. `bun run dev` no demo-storefront sobe (Vite :5173, HTTP 200) e overlay aparece com termo de zero-results
7. Estados ✅ verde e ❌ vermelho funcionam

## Constraints

- **NÃO usar a conta `patrickpassosb`** — push APENAS como `isaacnewtonagent` (colaborador, já configurado: `git config user.name/email` no repo)
- **NÃO adicionar/alterar credenciais** — `adminAccessToken` do Shopify é criptografado (não mexer); busca usa `storefrontAccessToken` (texto puro)
- Não quebrar o build dos apps (verificar `bun run dev` após cada mudança)
- Não modificar código fora das boundaries do BRIEF
- Todo código, commits e README em **português**
- LLM: DeepSeek V4 Flash via `http://ai.tail492ce8.ts.net/v1`, `Authorization: Bearer not-required` (ver BRIEF seção 6)

## Boundaries

- `/root/search-recovery/mcp-app/api/tools/` (tools), `api/tools/index.ts` (registro), `api/resources/` (UIs), `web/tools/` (React)
- `/root/search-recovery/demo-storefront/src/components/search/` (overlay), `src/loaders/` (se necessário)
- `docs/`, `README.md`
- `package.json` dos dois apps (adicionar deps se necessário)

## Stop conditions (parar e reportar, NÃO improvisar)

1. Precisar de credencial/decissão fora do BRIEF
2. `bun install` falhar além de 1 tentativa com `--force`
3. LLM do Aperture inacessível (fallback: busca lexical + reportar)
4. Nunca declarar done sem evidência de comando/teste
5. Se o `bun run dev` do demo-storefront falhar por bloqueio de porta — matar processos antigos (`pkill -f vite` / `pkill -f "bun run dev"`) e tentar de novo

## Notas

- Prioridade: lógica das tools (T1-T4) → UIs → overlay
- Commits atômicos e frequentes na main (mensagens em PT)
- O mcp-app tem `bun start` que faz `deco link` — NÃO usar (requer login do Patrick); usar `bun run dev:api` direto
- Demo-storefront: loja Shopify `gimenesdevstore` já configurada (produtos de exemplo existem)
- Consultar o vault em `/root/obsidian-vault/Hackathons/Agents for Commerce Deco 2026/` para contexto completo (PRD, fluxograma, insights)
