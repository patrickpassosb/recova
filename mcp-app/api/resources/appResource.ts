import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicResource } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

function getDistPath(): string {
	const projectRoot = join(import.meta.dir, "../..");
	return join(projectRoot, "dist", "client", "index.html");
}

/**
 * Cria um resource MCP App que serve o bundle único da UI (o SPA roteia
 * para a página da tool pelo `toolName` do host).
 */
export function createAppResource(
	uri: string,
	name: string,
	description: string,
) {
	return (_env: Env) =>
		createPublicResource({
			uri,
			name,
			description,
			mimeType: RESOURCE_MIME_TYPE,
			read: async () => {
				const html = await readFile(getDistPath(), "utf-8");
				return {
					uri,
					mimeType: RESOURCE_MIME_TYPE,
					text: html,
				};
			},
		});
}
