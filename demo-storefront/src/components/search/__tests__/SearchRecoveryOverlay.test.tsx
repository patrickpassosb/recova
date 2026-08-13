import { describe, it, expect, afterEach, beforeEach, vi } from "bun:test";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SearchRecoveryOverlay, {
  getLatestRefinementOptions,
  getReengagementDelay,
} from "../SearchRecoveryOverlay.tsx";

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
        description: "Tênis de lona confortável para o dia a dia.",
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

  it("restarts the reengagement wait after recent activity", () => {
    expect(getReengagementDelay(10_000, 40_000)).toBe(30_000);
    expect(getReengagementDelay(10_000, 70_000)).toBe(0);
  });

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

  function renderOverlay(props?: {
    onClose?: () => void;
    variant?: "popup" | "inline";
    carouselLayout?: "masked" | "wide";
  }) {
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

  it("restarts recovery from the user's message when the initial session failed", async () => {
    let invokeCalls = 0;
    globalThis.fetch = (async (input: any) => {
      if (!String(input).includes("/deco/invoke/")) {
        throw new Error(`Unexpected fetch in component test: ${input}`);
      }
      invokeCalls++;
      return new Response(JSON.stringify(invokeCalls === 1 ? null : agentResult), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    renderOverlay({ variant: "inline" });
    await waitFor(() => expect(screen.getByText(/Não consegui encontrar uma opção/i)).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText("Responda ao assistente..."), {
      target: { value: "quero um tenis" },
    });
    fireEvent.click(screen.getByText("Enviar"));

    await waitFor(() => expect(screen.getByText(/Encontrei tênis/i)).toBeTruthy());
    expect(screen.getByText("High Top Canvas Shoes")).toBeTruthy();
  });

  it("does not render a close button in inline mode", async () => {
    renderOverlay({ variant: "inline" });
    await waitFor(() => expect(screen.getByText(/Encontrei tênis/i)).toBeTruthy());
    expect(screen.queryByLabelText("Fechar")).toBeNull();
  });

  it("keeps a functional close button in popup mode", async () => {
    let closed = false;
    renderOverlay({ variant: "popup", onClose: () => (closed = true) });
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

  it("keeps purchase actions enabled while carousel autoplay is paused", async () => {
    renderOverlay({ variant: "inline" });
    await waitFor(() => expect(screen.getByText(/Encontrei tênis/i)).toBeTruthy());

    const card = document.querySelector("[data-card]");
    const carousel = card?.parentElement?.parentElement;
    const buyButton = screen.getByText("Comprar") as HTMLButtonElement;
    const addButton = screen.getByText("Adicionar ao carrinho") as HTMLButtonElement;

    expect(carousel).toBeTruthy();
    fireEvent.mouseEnter(carousel!);
    expect(buyButton.disabled).toBe(false);
    expect(addButton.disabled).toBe(false);
    fireEvent.touchStart(carousel!);
    expect(buyButton.disabled).toBe(false);
    expect(addButton.disabled).toBe(false);
  });

  it("keeps the latest actionable chips through agent messages without options", () => {
    expect(
      getLatestRefinementOptions([
        { role: "agent", refinementOptions: ["Casual", "Esportivo"] },
        { role: "user" },
        { role: "agent" },
      ]),
    ).toEqual(["Casual", "Esportivo"]);

    expect(
      getLatestRefinementOptions([
        { role: "agent", refinementOptions: ["Casual", "Esportivo"] },
        { role: "agent" },
        { role: "agent", refinementOptions: ["Mais barato", "Premium"] },
      ]),
    ).toEqual(["Mais barato", "Premium"]);
  });

  it('labels refinement choices as "O que você prefere?"', async () => {
    renderOverlay({ variant: "inline" });
    await waitFor(() => expect(screen.getByText("O que você prefere?")).toBeTruthy());
  });

  it("renders products in an accessible coverflow carousel", async () => {
    renderOverlay();
    await waitFor(() => expect(screen.getByText(/Encontrei tênis/i)).toBeTruthy());
    expect(screen.getByRole("region", { name: "Produtos recomendados" })).toBeTruthy();
    expect(document.querySelector("[data-card]")).toBeTruthy();
  });

  it("uses the requested masked and wide scroll-snap carousel layouts", async () => {
    const masked = renderOverlay({ variant: "inline", carouselLayout: "masked" });
    await waitFor(() => expect(screen.getByText(/Encontrei tênis/i)).toBeTruthy());
    const maskedCarousel = screen.getByRole("region", { name: "Produtos recomendados" });
    expect(maskedCarousel.getAttribute("data-carousel-layout")).toBe("masked");
    expect(maskedCarousel.querySelector("[data-card]")?.className).toContain("snap-center");
    expect(maskedCarousel.querySelector("[data-card]")?.className).toContain("h-[22.5rem]");

    masked.unmount();
    renderOverlay({ variant: "inline", carouselLayout: "wide" });
    await waitFor(() => expect(screen.getByText(/Encontrei tênis/i)).toBeTruthy());
    const wideCarousel = screen.getByRole("region", { name: "Produtos recomendados" });
    expect(wideCarousel.getAttribute("data-carousel-layout")).toBe("wide");
    expect(wideCarousel.querySelector("[data-card]")?.className).toContain("snap-center");
    expect(wideCarousel.querySelector("[data-card]")?.className).toContain("h-[27.5rem]");
  });

  it("shows Shopify product descriptions in compact and wide layouts", async () => {
    const masked = renderOverlay({ variant: "inline", carouselLayout: "masked" });
    await waitFor(() => expect(screen.getByText(/Encontrei tênis/i)).toBeTruthy());
    expect(screen.getByText("Tênis de lona confortável para o dia a dia.").className).toContain(
      "line-clamp-2",
    );

    masked.unmount();
    renderOverlay({ variant: "inline", carouselLayout: "wide" });
    await waitFor(() => expect(screen.getByText(/Encontrei tênis/i)).toBeTruthy());
    expect(screen.getByText("Tênis de lona confortável para o dia a dia.").className).toContain(
      "line-clamp-2",
    );
  });

  it("starts each recovery at the top of the chat", async () => {
    let resolveInitial!: (response: Response) => void;
    globalThis.fetch = (() =>
      new Promise<Response>((resolve) => {
        resolveInitial = resolve;
      })) as typeof fetch;

    renderOverlay({ variant: "inline", carouselLayout: "masked" });
    const chat = document.querySelector("[data-chat-scroll]") as HTMLDivElement;
    chat.scrollTop = 240;

    resolveInitial(
      new Response(JSON.stringify(agentResult), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await waitFor(() => expect(screen.getByText(/Encontrei tênis/i)).toBeTruthy());
    expect(chat.scrollTop).toBe(0);
  });

  it("scrolls only after a subsequent agent response", async () => {
    let invokeCalls = 0;
    let resolveReply!: (response: Response) => void;
    globalThis.fetch = ((input: RequestInfo | URL) => {
      if (!String(input).includes("/deco/invoke/")) {
        throw new Error(`Unexpected fetch in component test: ${input}`);
      }
      invokeCalls++;
      if (invokeCalls === 1) {
        return Promise.resolve(
          new Response(JSON.stringify(agentResult), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return new Promise<Response>((resolve) => {
        resolveReply = resolve;
      });
    }) as typeof fetch;

    renderOverlay({ variant: "inline", carouselLayout: "masked" });
    await waitFor(() => expect(screen.getByText(/Encontrei tênis/i)).toBeTruthy());
    const chat = document.querySelector("[data-chat-scroll]") as HTMLDivElement;
    Object.defineProperty(chat, "scrollHeight", { configurable: true, value: 900 });
    chat.scrollTop = 120;

    fireEvent.change(screen.getByPlaceholderText("Responda ao assistente..."), {
      target: { value: "quero outro modelo" },
    });
    fireEvent.click(screen.getByText("Enviar"));
    await waitFor(() => expect(screen.getByText("quero outro modelo")).toBeTruthy());
    expect(chat.scrollTop).toBe(120);

    resolveReply(
      new Response(
        JSON.stringify({
          ...agentResult,
          explanation: "Encontrei uma nova opção para você.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await waitFor(() => expect(screen.getByText(/nova opção/i)).toBeTruthy());
    expect(chat.scrollTop).toBe(900);
  });

  it("renders action buttons on every product card (not only the active one)", async () => {
    globalThis.fetch = (async (input: any) => {
      if (!String(input).includes("/deco/invoke/")) {
        throw new Error(`Unexpected fetch in component test: ${input}`);
      }
      return new Response(
        JSON.stringify({
          ...agentResult,
          products: [
            agentResult.products[0],
            { ...agentResult.products[0], id: "gid://2", title: "Canvas Slip-On" },
            { ...agentResult.products[0], id: "gid://3", title: "Running Sneakers" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    renderOverlay({ variant: "inline", carouselLayout: "wide" });
    await waitFor(() => expect(screen.getByText("Canvas Slip-On")).toBeTruthy());
    const cards = document.querySelectorAll("[data-card]");
    expect(cards.length).toBeGreaterThanOrEqual(2);
    for (const card of cards) {
      const buttons = card.querySelectorAll("button");
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("links the footer Recova logo to the landing page", async () => {
    renderOverlay({ variant: "inline" });
    await waitFor(() => expect(screen.getByText(/Encontrei tênis/i)).toBeTruthy());
    const branding = screen.getByRole("link", { name: /Powered by Recova/i });
    expect(branding.getAttribute("href")).toBe("https://recova.gabrielsacilotto.com.br/");
  });

  it("shows the red failed state when reengagement is exhausted", async () => {
    // Reengage esgotado (máx 2 tentativas) e cliente não converteu → ❌ vermelho.
    globalThis.fetch = (async (input: any, init?: any) => {
      if (!String(input).includes("/deco/invoke/")) {
        throw new Error(`Unexpected fetch in component test: ${input}`);
      }
      const body = String(init?.body ?? "");
      const isReengage = body.includes("reengage");
      return new Response(
        JSON.stringify(
          isReengage
            ? { message: "", attempt: 2, exhausted: true }
            : agentResult,
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    // Fake timers + relógio ANTES de renderizar para que o timer de
    // reengajamento (60s) seja agendado com o relógio fake.
    vi.useFakeTimers({ now: new Date("2026-08-13T00:00:00Z") });
    renderOverlay({ variant: "inline" });
    await waitFor(() => expect(screen.getByText(/Encontrei tênis/i)).toBeTruthy());

    // Avança 61s → dispara o reengage → esgotado → estado ❌ vermelho.
    vi.advanceTimersByTime(61_000);
    // Flush microtasks (ainda em fake timers) para a continuação async do
    // reengage resolver e chamar setFlow({status:"failed"}).
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // Volta para timers reais para o waitFor funcionar.
    vi.useRealTimers();
    await waitFor(() => {
      expect(screen.getByText("Sem conversão")).toBeTruthy();
    });
    expect(screen.getByText(/não adicionou nada ao carrinho/i)).toBeTruthy();
  });
});
