import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DecisionCards from "../DecisionCards.tsx";
import type { DecisionCard, RecoveryDecision } from "../../loaders/recoveryGateway";

/**
 * Component tests for DecisionCards — the W09 inline recovery surface.
 *
 * The component is a pure presentational slice: it receives a `RecoveryDecision`
 * and renders at most three grounded cards. We wrap it in a QueryClientProvider
 * because the CTA buttons use `useAddToCart` (which needs the query client).
 */

function makeCard(overrides: Partial<DecisionCard> = {}): DecisionCard {
  return {
    productId: "p-1",
    variantId: "v-1",
    handle: "product-1",
    title: "Product 1",
    imageUrl: null,
    price: 100,
    available: true,
    selectedOptions: [{ name: "Size", value: "M" }],
    matchScore: 1,
    satisfied: ["size"],
    relaxedSoft: [],
    unknown: [],
    reason: "satisfies size",
    rank: 1,
    ...overrides,
  };
}

function makeDecision(
  cards: DecisionCard[],
  route: RecoveryDecision["route"] = "RECOVER",
): RecoveryDecision {
  return {
    sessionId: "sess-1",
    route,
    strategy: "EXACT_ALTERNATIVE",
    activationReasons: ["native search returned zero results"],
    constraints: [{ kind: "size", value: "M", hardness: "hard", sourceText: "size M" }],
    cards,
    rejectedCandidates: [],
    refinementPrompt: null,
    refinementOptions: [],
  };
}

function renderCards(decision: RecoveryDecision, query = "shoes") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <DecisionCards decision={decision} query={query} />
    </QueryClientProvider>,
  );
}

describe("DecisionCards", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders three cards with constraint badges and a reassurance line", () => {
    const cards = [
      makeCard({ productId: "p-1", title: "Product 1", satisfied: ["size"], unknown: ["color"] }),
      makeCard({ productId: "p-2", title: "Product 2", satisfied: ["size"] }),
      makeCard({ productId: "p-3", title: "Product 3", satisfied: ["size"] }),
    ];
    renderCards(makeDecision(cards));

    expect(screen.getByText(/No exact match for/)).toBeTruthy();
    expect(screen.getByText("Product 1")).toBeTruthy();
    expect(screen.getByText("Product 2")).toBeTruthy();
    expect(screen.getByText("Product 3")).toBeTruthy();

    // Satisfied hard constraints render as green icon-only badges (no text).
    expect(screen.getAllByRole("img", { name: /Satisfies size/ }).length).toBe(3);

    // Unknown evidence is marked as unknown rather than silently upgraded.
    expect(screen.getByText("color unknown")).toBeTruthy();
  });

  it("shows an unavailable badge and disables Buy now for unavailable products", () => {
    const cards = [
      makeCard({ productId: "p-1", title: "In stock item", available: true }),
      makeCard({ productId: "p-2", title: "Out of stock item", available: false }),
    ];
    renderCards(makeDecision(cards));

    expect(screen.getByText("Unavailable")).toBeTruthy();

    const unavailableCard = screen.getByText("Unavailable").closest("article")!;
    const buyNow = within(unavailableCard).getByRole("button", { name: "Buy now" });
    expect(buyNow.disabled).toBe(true);

    const availableCard = screen.getByText("In stock item").closest("article")!;
    const availableBuyNow = within(availableCard).getByRole("button", { name: "Buy now" });
    expect(availableBuyNow.disabled).toBe(false);
  });

  it("renders nothing for a CLARIFY decision", () => {
    const { container } = renderCards(makeDecision([], "CLARIFY"));
    expect(container.firstChild).toBeNull();
  });

  it("caps at three cards even when the decision carries five", () => {
    const cards = [1, 2, 3, 4, 5].map((i) =>
      makeCard({ productId: `p-${i}`, title: `Product ${i}` }),
    );
    renderCards(makeDecision(cards));

    expect(screen.getAllByRole("article").length).toBe(3);
    expect(screen.getByText("Product 1")).toBeTruthy();
    expect(screen.getByText("Product 3")).toBeTruthy();
    expect(screen.queryByText("Product 4")).toBeNull();
    expect(screen.queryByText("Product 5")).toBeNull();
  });
});
