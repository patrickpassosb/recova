import { useAddToCart } from "../../platform/cart";
import { recovaDefaultTheme } from "./recovaTheme";
import type { ConstraintKind, DecisionCard, RecoveryDecision } from "../../loaders/recoveryGateway";

/**
 * DecisionCards — the W09 inline recovery surface.
 *
 * Renders a grounded `RecoveryDecision` (route `RECOVER`) as at most three
 * Decision Cards below the search bar. This is the V2 replacement for the
 * conversational overlay on the zero-results path: deterministic, grounded,
 * and silent when there is nothing to recover.
 *
 * Brand rules honoured here:
 *   - green (`theme.colors.success`) is icon-only and never carries text;
 *   - relaxed soft preferences are disclosed in the card `reason` text;
 *   - unknown evidence is marked "unknown" rather than silently upgraded.
 */

const theme = recovaDefaultTheme;

const CONSTRAINT_LABELS: Record<ConstraintKind, string> = {
  category: "category",
  price_max: "price",
  size: "size",
  color: "color",
  compatibility: "compatibility",
  intended_use: "intended use",
};

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

/** Green check icon — icon only, no text (brand rule). */
function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" stroke={theme.colors.success} strokeWidth="2" />
      <path
        d="M8 12.5l2.5 2.5L16 9.5"
        stroke={theme.colors.success}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface DecisionCardsProps {
  decision: RecoveryDecision;
  query: string;
}

export default function DecisionCards({ decision, query }: DecisionCardsProps) {
  const addToCart = useAddToCart();

  if (decision.route !== "RECOVER" || decision.cards.length === 0) {
    return null;
  }

  // The "at most three cards" rule is a domain invariant, but the component
  // still caps defensively so a solver bug can never flood the page.
  const cards = decision.cards.slice(0, 3);

  const hardKinds = new Set(
    decision.constraints.filter((c) => c.hardness === "hard").map((c) => c.kind),
  );

  const handleAddToCart = (card: DecisionCard) => {
    addToCart.mutate({ merchandiseId: card.variantId, quantity: 1 });
  };

  const handleBuyNow = (card: DecisionCard) => {
    addToCart.mutate(
      { merchandiseId: card.variantId, quantity: 1 },
      {
        onSuccess: (cartState) => {
          if (cartState.checkoutUrl) {
            window.location.href = cartState.checkoutUrl;
          }
        },
      },
    );
  };

  return (
    <section
      aria-live="polite"
      aria-label="Recovery suggestions"
      className="flex w-full flex-col gap-4"
    >
      <p className="text-sm font-medium" style={{ color: theme.colors.text }}>
        No exact match for &ldquo;{query}&rdquo;
      </p>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const satisfiedHard = card.satisfied.filter((kind) => hardKinds.has(kind));
          const unavailable = !card.available;
          const busy = addToCart.isPending;

          return (
            <article
              key={card.productId}
              className="flex flex-col gap-3 rounded-lg border p-4 shadow-sm transition-shadow motion-reduce:transition-none hover:shadow-md"
              style={{
                backgroundColor: theme.colors.cardBg,
                borderColor: theme.colors.border,
              }}
            >
              <div
                className="h-40 w-full overflow-hidden rounded-md"
                style={{ backgroundColor: theme.colors.surface }}
              >
                {card.imageUrl ? (
                  <img
                    src={card.imageUrl}
                    alt={card.title}
                    className="h-full w-full object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="h-full w-full" style={{ backgroundColor: theme.colors.border }} />
                )}
              </div>

              <div className="flex flex-col gap-1">
                <h3
                  className="line-clamp-2 text-sm font-semibold leading-snug"
                  style={{ color: theme.colors.text }}
                >
                  {card.title}
                </h3>
                <p className="text-sm font-bold" style={{ color: theme.colors.primary }}>
                  {formatPrice(card.price)}
                </p>
              </div>

              {card.selectedOptions.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Selected options">
                  {card.selectedOptions.map((option) => (
                    <li
                      key={`${option.name}:${option.value}`}
                      className="rounded-full border px-2 py-0.5 text-xs"
                      style={{
                        borderColor: theme.colors.border,
                        color: theme.colors.muted,
                      }}
                    >
                      {option.name}: {option.value}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                {satisfiedHard.map((kind) => (
                  <span
                    key={kind}
                    role="img"
                    aria-label={`Satisfies ${CONSTRAINT_LABELS[kind]}`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${theme.colors.success}1A` }}
                  >
                    <CheckIcon />
                  </span>
                ))}

                {card.unknown.map((kind) => (
                  <span
                    key={kind}
                    className="rounded-full border px-2 py-0.5 text-xs"
                    style={{
                      borderColor: theme.colors.border,
                      color: theme.colors.muted,
                    }}
                  >
                    {CONSTRAINT_LABELS[kind]} unknown
                  </span>
                ))}

                {unavailable && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{
                      backgroundColor: `${theme.colors.danger}1A`,
                      color: theme.colors.danger,
                    }}
                  >
                    Unavailable
                  </span>
                )}
              </div>

              {card.reason && (
                <p className="text-xs leading-relaxed" style={{ color: theme.colors.muted }}>
                  {card.reason}
                </p>
              )}

              <div className="mt-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => handleAddToCart(card)}
                  disabled={busy || unavailable}
                  className="flex-1 rounded-md border px-3 py-2 text-xs font-semibold transition-opacity motion-reduce:transition-none hover:opacity-80 focus-visible:ring-2 disabled:opacity-40"
                  style={{
                    borderColor: theme.colors.primary,
                    color: theme.colors.primary,
                    backgroundColor: "transparent",
                  }}
                >
                  Add to cart
                </button>
                <button
                  type="button"
                  onClick={() => handleBuyNow(card)}
                  disabled={busy || unavailable}
                  className="flex-1 rounded-md px-3 py-2 text-xs font-semibold text-white transition-opacity motion-reduce:transition-none hover:opacity-80 focus-visible:ring-2 disabled:opacity-40"
                  style={{ backgroundColor: theme.colors.primary }}
                >
                  Buy now
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
