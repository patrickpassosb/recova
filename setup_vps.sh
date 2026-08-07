#!/usr/bin/env bash
# setup_vps.sh — Prepara a VPS para o build do Search Recovery Agent
# Uso: bash setup_vps.sh   (rodar como root na VPS)

set -euo pipefail

echo "=== [1/5] Instalando Bun ==="
if ! command -v bun &>/dev/null; then
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
  echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
fi
bun --version

echo ""
echo "=== [2/5] Aceitando convite do repo (se pendente) ==="
# Aceita convite de colaboração pendente (conta isaacnewtonagent)
gh api user/repository_invitations --jq '.[] | .id' 2>/dev/null | while read -r inv_id; do
  echo "Aceitando convite $inv_id"
  gh api -X PATCH "user/repository_invitations/$inv_id" >/dev/null 2>&1 || true
done

echo ""
echo "=== [3/5] Clonando repo ==="
cd /root
if [ ! -d /root/search-recovery ]; then
  git clone https://github.com/patrickpassosb/search-recovery-agent.git /root/search-recovery
else
  cd /root/search-recovery && git pull --ff-only
fi
cd /root/search-recovery
echo "Repo em: $(pwd)"

echo ""
echo "=== [4/5] Instalando dependências ==="
export PATH="$HOME/.bun/bin:$PATH"

echo "--- mcp-app ---"
cd /root/search-recovery/mcp-app
time bun install 2>&1 | tail -5

echo "--- demo-storefront ---"
cd /root/search-recovery/demo-storefront
time bun install 2>&1 | tail -5

echo ""
echo "=== [5/5] Verificando dev servers ==="
echo "--- mcp-app (porta 3001) ---"
cd /root/search-recovery/mcp-app
timeout 20 bun run dev:api > /tmp/mcp-dev.log 2>&1 &
MCP_PID=$!
sleep 8
curl -s -o /dev/null -w "MCP endpoint: HTTP %{http_code}\n" http://localhost:3001/api/mcp || echo "MCP endpoint: FALHOU (ver /tmp/mcp-dev.log)"
kill $MCP_PID 2>/dev/null || true
tail -5 /tmp/mcp-dev.log

echo ""
echo "=== SETUP COMPLETO ==="
echo "Proximo passo: rodar o /goal no Hermes (profile software-engineer)"
echo "  hermes -p software-engineer"
echo "  dentro do chat: /goal <contrato do BRIEF>"
