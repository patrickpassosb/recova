import { describe, expect, it } from "bun:test";
import { helloPrompt } from "../../prompts/hello.ts";
import { helloTool } from "../hello.ts";

/** T0 — hello_world tool (sanity/health check of the MCP wiring). */
describe("hello tool", () => {
	const tool = helloTool({} as never);

	function run(name?: string) {
		return tool.execute({
			context: { name },
			runtimeContext: {} as never,
		}) as Promise<{ greeting: string; timestamp: string }>;
	}

	it("greets a provided name", async () => {
		const res = await run("Patrick");
		expect(res.greeting).toContain("Patrick");
		expect(res.timestamp).toBeTruthy();
	});

	it("defaults to World when no name", async () => {
		const res = await run();
		expect(res.greeting).toContain("World");
	});

	it("emits a valid ISO timestamp", async () => {
		const res = await run("X");
		expect(() => new Date(res.timestamp).toISOString()).not.toThrow();
	});
});

/** hello prompt produces a user message for the hello_world tool. */
describe("hello prompt", () => {
	const prompt = helloPrompt({} as never);

	it("returns a user message asking to greet the given name", async () => {
		const res = (await prompt.execute({
			args: { name: "Ana" },
			runtimeContext: {} as never,
		})) as { messages: Array<{ role: string; content: { text: string } }> };
		expect(res.messages[0].role).toBe("user");
		expect(res.messages[0].content.text).toContain("Ana");
	});
});
