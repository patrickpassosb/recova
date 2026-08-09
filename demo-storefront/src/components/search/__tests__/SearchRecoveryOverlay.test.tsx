import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SearchRecoveryOverlay from "../SearchRecoveryOverlay.tsx";

/**
 * Component tests for the SearchRecoveryOverlay — the conversational overlay
 * that opens on zero-results searches.
 *
 * DOM globals are provided by src/test/setup.ts (loaded via --preload).
 * We stub `globalThis.fetch` so `invoke.site.loaders.searchRecovery` (which
 * POSTs to /deco/invoke/...) returns a deterministic agent response, and wrap
 * the overlay in a QueryClientProvider for the cart hooks.
 */
describe("SearchRecoveryOverlay", () => {
  const originalFetch = globalThis.fetch;

  const agentResult = {
    session_id: "sess-1",
    products: [
      {
        id: "gid://1",
        title: "High Top Canvas Shoes",
        price: 120,
        image: null,
        score: 0.8,
        match_type: "MATCH" as const,
        variant_id: "var-1",
      },
    ],
    explanation: "Encontrei tênis que combinam com você.",
    follow_up_question: "Prefere casual ou esportivo?",
    refinement_options: ["Casual", "Esportivo"],
  };

  beforeEach(() => {
    globalThis.fetch = (async (input: any) => {
      if (String(input).includes("/deco/invoke/")) {
        return new Response(JSON.stringify(agentResult), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch in component test: ${input}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  function renderOverlay(props?: { onClose?: () => void }) {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
      <QueryClientProvider client={qc}>
        <SearchRecoveryOverlay term="tenis" {...props} />
      </QueryClientProvider>,
    );
  }

  it("opens and shows the agent recovery message with products", async () => {
    renderOverlay();
    await waitFor(() => {
      expect(screen.getByText(/Encontrei tênis/i)).toBeTruthy();
    });
    expect(screen.getByText("High Top Canvas Shoes")).toBeTruthy();
    expect(screen.getByText("Casual")).toBeTruthy();
    expect(screen.getByText("Esportivo")).toBeTruthy();
  });

  it("shows a friendly fallback when the agent is unreachable", async () => {
    // The loader signals "agent unavailable" by resolving to null → overlay
    // shows the friendly fallback message.
    globalThis.fetch = (async () =>
      new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    renderOverlay();
    await waitFor(() => {
      expect(screen.getByText(/Não consegui encontrar uma opção/i)).toBeTruthy();
    });
  });

  it("closes via the header close button and calls onClose", async () => {
    let closed = false;
    renderOverlay({ onClose: () => (closed = true) });
    await waitFor(() => expect(screen.getByText(/Encontrei tênis/i)).toBeTruthy());
    // There are two elements labelled "Fechar" (backdrop + header button);
    // the header button is the one that closes.
    const closeButtons = screen.getAllByLabelText("Fechar");
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(closed).toBe(true);
  });

  it("shows two action buttons per product (Comprar + Adicionar ao carrinho)", async () => {
    renderOverlay();
    await waitFor(() => expect(screen.getByText(/Encontrei tênis/i)).toBeTruthy());
    expect(screen.getByText("Comprar")).toBeTruthy();
    expect(screen.getByText("Adicionar ao carrinho")).toBeTruthy();
  });

  it("renders the product carousel with auto-play track", async () => {
    renderOverlay();
    await waitFor(() => expect(screen.getByText(/Encontrei tênis/i)).toBeTruthy());
    // The carousel track is the scrollable container holding the product card.
    const track = document.querySelector("[data-card]")?.parentElement;
    expect(track).toBeTruthy();
    expect(track?.className).toContain("overflow-x-auto");
  });
});
