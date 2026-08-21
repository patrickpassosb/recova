import { describe, expect, it } from "bun:test";
import { chat, extractJson, LlmError } from "../llm.ts";

describe("extractJson", () => {
	it("parses plain JSON", () => {
		expect(extractJson<{ a: number }>('{"a": 1}')).toEqual({ a: 1 });
	});

	it("parses JSON wrapped in markdown code fence", () => {
		const text = '```json\n{"a": 1}\n```';
		expect(extractJson<{ a: number }>(text)).toEqual({ a: 1 });
	});

	it("parses JSON in a bare ``` fence", () => {
		const text = '```\n{"b": "x"}\n```';
		expect(extractJson<{ b: string }>(text)).toEqual({ b: "x" });
	});

	it("returns null on invalid JSON", () => {
		expect(extractJson("not json at all")).toBeNull();
	});

	it("returns null on empty input", () => {
		expect(extractJson("")).toBeNull();
	});

	it("strips surrounding prose", () => {
		const text = 'Aqui está:\n```json\n{"ok": true}\n```\nEspero ajudar!';
		expect(extractJson<{ ok: boolean }>(text)).toEqual({ ok: true });
	});
});

describe("chat (network)", () => {
	// These tests exercise the real HTTP path with the configured LLM key
	// (OLLAMA_API_KEY ou OPENAI_API_KEY). They are skipped automatically when
	// no key is available so CI stays green without secrets. When mcp-app/.env
	// has either key, they run for real.
	const hasKey =
		(process.env.OLLAMA_API_KEY ?? "").length > 0 ||
		(process.env.OPENAI_API_KEY ?? "").length > 0;
	// Live network calls só rodam com RUN_LLM_LIVE=1 — o suite padrão é
	// determinístico e offline (CI integrity, §9.5).
	const runLive = process.env.RUN_LLM_LIVE === "1" && hasKey;

	const itIfKey = (name: string, fn: () => Promise<void>) =>
		(runLive ? it : it.skipIf(!runLive))(name, fn);

	itIfKey("calls the LLM and returns trimmed content", async () => {
		const text = await chat([
			{ role: "system", content: "Responda apenas: ok" },
			{ role: "user", content: "oi" },
		]);
		expect(text.length).toBeGreaterThan(0);
		expect(text).toBe(text.trim());
	});

	itIfKey("throws LlmError when the API returns an error status", async () => {
		const original = globalThis.fetch;
		// Simulate a 500 from the LLM provider
		globalThis.fetch = (async () =>
			new Response("boom", { status: 500 })) as unknown as typeof fetch;
		try {
			await expect(
				chat([{ role: "user", content: "oi" }]),
			).rejects.toBeInstanceOf(LlmError);
		} finally {
			globalThis.fetch = original;
		}
	});

	itIfKey("throws LlmError on empty content", async () => {
		const original = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({ choices: [{ message: { content: "" } }] }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			)) as unknown as typeof fetch;
		try {
			await expect(
				chat([{ role: "user", content: "oi" }]),
			).rejects.toBeInstanceOf(LlmError);
		} finally {
			globalThis.fetch = original;
		}
	});

	it("exposes LlmError as the error type for callers", () => {
		expect(typeof LlmError).toBe("function");
	});
});
