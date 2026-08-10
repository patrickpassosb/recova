import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SearchModal from "../SearchModal.tsx";

describe("SearchModal", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("submits without starting a second recovery request", () => {
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls++;
      return new Response(JSON.stringify({ products: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    render(<SearchModal />);
    fireEvent.click(screen.getByRole("button", { name: "O que você está procurando?" }));

    const input = screen.getByRole("textbox", { name: "Buscar" });
    fireEvent.change(input, { target: { value: "hihi" } });
    fireEvent.submit(input.closest("form")!);

    expect(fetchCalls).toBe(0);
  });
});
