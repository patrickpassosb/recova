import { app } from "./app.ts";

const PORT = Number(process.env.PORT) || 3001;

// Warm-up do catálogo Shopify em background: a primeira chamada do agente
// não paga o fetch do catálogo (mantém o tempo de resposta <2s).
import { fetchCatalog } from "./lib/shopify.ts";
fetchCatalog().catch((err) => {
  console.warn(`[warmup] catálogo indisponível no boot: ${err instanceof Error ? err.message : err}`);
});

Bun.serve({
	idleTimeout: 0,
	hostname: "0.0.0.0",
	port: PORT,
	fetch: app.fetch,
});

const slug = process.env.WORKTREE_SLUG;
const baseUrl = slug ? `http://${slug}.localhost` : `http://localhost:${PORT}`;

console.log("");
console.log(`MCP App: ${baseUrl}/api/mcp`);
console.log("");
