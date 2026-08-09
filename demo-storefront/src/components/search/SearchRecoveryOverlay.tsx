/**
 * SearchRecoveryOverlay — o agente de recuperação de busca no storefront.
 *
 * Segue o fluxograma + decisões da reunião 09/08:
 * 1. Busca nativa retorna zero resultados → o agente entra (SÓ no Enter)
 * 2. Agente entra como chat com produtos + 1 pergunta de refinamento com chips
 * 3. Produtos são CLICÁVEIS (vão para a página do produto) e têm 2 botões:
 *    "Comprar" (adiciona ao carrinho e vai ao checkout) e "Adicionar ao carrinho"
 * 4. O chat NUNCA encerra sozinho — fica aberto enquanto a aba estiver aberta
 * 5. Reengajamento: após 30s sem ação, envia nova mensagem + som de alerta
 * 6. "Powered by Recova" é clicável → landing page
 *
 * White-label (estilo Tidio): o tema é injetado via `theme` prop. Free tier usa
 * o tema Recova padrão; planos pagos permitem customização total.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "../../runtime";
import { useAddToCart, useCart } from "../../platform/cart";
import type {
  RecoveryProduct,
  RecoveryResult,
} from "../../loaders/searchRecovery";
import {
  recovaDefaultTheme,
  resolveTheme,
  themeToCssVars,
  type RecovaTheme,
  type RecovaThemeConfig,
} from "./recovaTheme";

export interface SearchRecoveryOverlayProps {
  /** Termo da busca que retornou zero resultados */
  term: string;
  /** Chamado quando o overlay fecha */
  onClose?: () => void;
  /** Tema white-label (opcional — default: Recova, free tier) */
  theme?: RecovaThemeConfig;
  /**
   * Variante de renderização:
   * - "popup" (default): overlay fixo em tela cheia (usado no Enter / zero results).
   * - "inline": renderizado em fluxo, embaixo da barra de busca (após ~10s sem
   *   recomendações ao digitar) — decisão da reunião 09/08, não é pop-up.
   */
  variant?: "popup" | "inline";
}

type ChatMessage =
  | {
      role: "agent";
      text: string;
      products?: RecoveryProduct[];
      /** Chips de refinamento dinâmicos vindos do backend. */
      refinementOptions?: string[];
    }
  | { role: "user"; text: string };

type FlowState =
  | { status: "loading" }
  | { status: "chat" }
  | { status: "success" }; // ✅ verde

function formatPrice(price: number): string {
  return `R$ ${price.toFixed(2).replace(".", ",")}`;
}

/** URL da página do produto a partir do handle. */
function productUrl(handle?: string | null): string | null {
  if (!handle) return null;
  return `/products/${handle}`;
}

/** Toca um som de alerta curto (Web Audio) para o reengajamento. */
function playAlertSound() {
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
    // Libera o contexto após o som
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    // som é opcional — nunca quebra o fluxo
  }
}

/**
 * Emite um evento real de instrumentação (Fase C — dashboard 100% dados
 * reais). Chama o loader com action "track_event", que faz proxy para a tool
 * MCP track_event. Best-effort: nunca quebra o fluxo se falhar.
 */
function track(event: Record<string, unknown>): void {
  invoke.site.loaders
    .searchRecovery({ action: "track_event", event })
    .catch(() => {
      // instrumentação é best-effort — não quebra o overlay
    });
}

/** Hash simples de uma query (para o query_hash do schema). */
function hashQuery(query: string): string {
  let h = 0;
  for (let i = 0; i < query.length; i++) {
    h = (h * 31 + query.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

/**
 * Carrossel horizontal de produtos com auto-play (decisão 09/08).
 * Passa sozinho por padrão (para o usuário perceber que pode arrastar) e
 * pausa quando o usuário interage (hover/scroll/touch). Arrastável com
 * scroll-snap.
 */
function ProductCarousel({
  products,
  theme,
  onAddToCart,
  onProductClick,
}: {
  products: RecoveryProduct[];
  theme: RecovaTheme;
  onAddToCart: (p: RecoveryProduct, goToCheckout: boolean) => void;
  onProductClick: (p: RecoveryProduct) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  // Auto-play: rola um card por vez a cada 3s, até o fim, e volta ao início.
  useEffect(() => {
    if (products.length <= 1) return;
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    if (!card) return;
    const step = card.offsetWidth + 8; // card + gap
    const id = setInterval(() => {
      if (pausedRef.current) return;
      const max = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= max - 4) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ left: step, behavior: "smooth" });
      }
    }, 3000);
    return () => clearInterval(id);
  }, [products.length]);

  const pause = () => {
    pausedRef.current = true;
    setPaused(true);
  };
  const resume = () => {
    pausedRef.current = false;
    setPaused(false);
  };

  return (
    <div
      className="relative"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onTouchStart={pause}
      onTouchEnd={resume}
    >
      <div
        ref={trackRef}
        className="flex gap-2 overflow-x-auto pb-1"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {products.map((p) => {
          const url = productUrl(p.handle);
          return (
            <div
              key={p.id}
              data-card
              className="flex w-40 shrink-0 flex-col gap-2 rounded-lg border p-2 shadow-sm"
              style={{
                backgroundColor: theme.colors.cardBg,
                borderColor: theme.colors.border,
                scrollSnapAlign: "start",
              }}
            >
              {url ? (
                <a
                  href={url}
                  aria-label={`Ver ${p.title}`}
                  onClick={() => onProductClick(p)}
                >
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.title}
                      className="h-24 w-full rounded-md object-cover"
                    />
                  ) : (
                    <div
                      className="h-24 w-full rounded-md"
                      style={{ backgroundColor: theme.colors.border }}
                    />
                  )}
                </a>
              ) : p.image ? (
                <img
                  src={p.image}
                  alt={p.title}
                  className="h-24 w-full rounded-md object-cover"
                />
              ) : (
                <div
                  className="h-24 w-full rounded-md"
                  style={{ backgroundColor: theme.colors.border }}
                />
              )}
              <div className="min-w-0 flex-1">
                {url ? (
                  <a
                    href={url}
                    className="block truncate text-sm font-medium hover:underline"
                    style={{ color: theme.colors.text }}
                  >
                    {p.title}
                  </a>
                ) : (
                  <p className="truncate text-sm font-medium" style={{ color: theme.colors.text }}>
                    {p.title}
                  </p>
                )}
                <p className="text-xs" style={{ color: theme.colors.muted }}>
                  {formatPrice(p.price)}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => onAddToCart(p, true)}
                  disabled={paused}
                  className="rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ backgroundColor: theme.colors.primary }}
                >
                  {theme.copy.buy}
                </button>
                <button
                  type="button"
                  onClick={() => onAddToCart(p, false)}
                  disabled={paused}
                  className="rounded-md border px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{
                    borderColor: theme.colors.primary,
                    color: theme.colors.primary,
                  }}
                >
                  {theme.copy.addToCart}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SearchRecoveryOverlay({
  term,
  onClose,
  theme: themeConfig,
  variant = "popup",
}: SearchRecoveryOverlayProps) {
  const theme = resolveTheme(themeConfig);
  const cssVars = themeToCssVars(theme);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [flow, setFlow] = useState<FlowState>({ status: "loading" });
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const closedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Carrinho real (Shopify via server fn) — "Comprar"/"Adicionar" adicionam de verdade.
  const addToCart = useAddToCart();
  const { cart } = useCart();
  // Timer de reengajamento (30s de inatividade → nova mensagem + som)
  const reengageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Scrolla para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, flow]);

  // Abre a conversa automaticamente quando o overlay monta (zero results)
  useEffect(() => {
    let cancelled = false;
    setFlow({ status: "loading" });

    const start = async () => {
      const result = (await invoke.site.loaders.searchRecovery({
        query: term,
        action: "search_recovery",
      })) as RecoveryResult | null;

      if (cancelled || closedRef.current) return;
      if (!result) {
        setMessages([
          {
            role: "agent",
            text: "Não consegui encontrar uma opção confiável agora. Você pode tentar outra busca.",
          },
        ]);
        setFlow({ status: "chat" });
        return;
      }

      sessionRef.current = result.session_id;
      setMessages([
        {
          role: "agent",
          text: `${result.explanation}\n\n${result.follow_up_question}`,
          products: result.products,
          refinementOptions: result.refinement_options,
        },
      ]);
      setFlow({ status: "chat" });
      // Instrumentação (Fase C): exposição da Recova com os produtos reais.
      track({
        event: "recova_exposed",
        session_id: result.session_id,
        query_hash: hashQuery(term),
        trigger: "zero_results",
        products_shown: result.products.length,
      });
      for (const p of result.products) {
        track({
          event: "recova_product_viewed",
          session_id: result.session_id,
          product_id: p.id,
          price: p.price,
        });
      }
    };

    start();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  // Reengajamento: após 30s de inatividade, envia nova mensagem + som.
  // O chat NUNCA encerra sozinho — continua enquanto a aba estiver aberta.
  useEffect(() => {
    if (flow.status !== "chat" || closedRef.current) return;

    const schedule = () => {
      if (reengageTimerRef.current) clearTimeout(reengageTimerRef.current);
      reengageTimerRef.current = setTimeout(async () => {
        if (closedRef.current || flow.status !== "chat") return;
        const sessionId = sessionRef.current;
        if (!sessionId) return;
        try {
          const result = (await invoke.site.loaders.searchRecovery({
            session_id: sessionId,
            action: "reengage",
          })) as { message?: string } | null;
          if (closedRef.current) return;
          if (result?.message) {
            playAlertSound();
            setMessages((prev) => [
              ...prev,
              { role: "agent", text: result.message! },
            ]);
            // Instrumentação (Fase C): reengajamento.
            track({
              event: "recova_reengaged",
              session_id: sessionId,
              interaction_type: "reengagement",
            });
          }
        } catch {
          // reengajamento é best-effort — nunca quebra o chat
        }
        // agenda o próximo ciclo (30s)
        schedule();
      }, 30_000);
    };

    schedule();
    return () => {
      if (reengageTimerRef.current) clearTimeout(reengageTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.status]);

  // Cliente comprou uma sugestão → adiciona ao carrinho REAL (Shopify).
  // "Comprar" adiciona e vai ao checkout; "Adicionar ao carrinho" só adiciona.
  const handleAddToCart = (
    product: RecoveryProduct,
    goToCheckout: boolean,
  ) => {
    setMessages((prev) => [
      ...prev,
      { role: "user", text: `Quero comprar: ${product.title}` },
    ]);
    if (!product.variant_id) {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: "Desculpe, não consegui adicionar este item ao carrinho. Tente por outro produto?",
        },
      ]);
      setFlow({ status: "chat" });
      return;
    }
    addToCart.mutate(
      { merchandiseId: product.variant_id, quantity: 1 },
      {
        onSuccess: (cartState) => {
          if (closedRef.current) return;
          setMessages((prev) => [
            ...prev,
            {
              role: "agent",
              text: `Ótima escolha! 🎉 Adicionei ${product.title} (${formatPrice(product.price)}) ao carrinho.`,
            },
          ]);
          // Instrumentação (Fase C): compra atribuída à sessão exposta.
          track({
            event: "purchase_attributed",
            session_id: sessionRef.current ?? undefined,
            exposed_session_id: sessionRef.current ?? undefined,
            product_id: product.id,
            price: product.price,
          });
          if (goToCheckout) {
            const checkoutUrl = cartState?.checkoutUrl;
            if (checkoutUrl) {
              window.location.href = checkoutUrl;
              return;
            }
          }
          setFlow({ status: "success" });
        },
        onError: () => {
          if (closedRef.current) return;
          setMessages((prev) => [
            ...prev,
            {
              role: "agent",
              text: "Não consegui adicionar ao carrinho agora. Pode tentar de novo?",
            },
          ]);
          setFlow({ status: "chat" });
        },
      },
    );
  };

  // Cliente respondeu (chip ou texto) → converse (loop)
  const handleSend = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || thinking) return;
    setInput("");
    setThinking(true);

    setMessages((prev) => [...prev, { role: "user", text }]);

    const sessionId = sessionRef.current;
    if (!sessionId) {
      setThinking(false);
      return;
    }

    const result = (await invoke.site.loaders.searchRecovery({
      session_id: sessionId,
      user_response: text,
      action: "converse",
    })) as RecoveryResult | null;

    setThinking(false);
    if (closedRef.current) return;

    if (!result) {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: "Não consegui encontrar uma opção confiável agora. Você pode tentar outra busca.",
        },
      ]);
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "agent",
        text: `${result.explanation}\n\n${result.follow_up_question}`,
        products: result.products,
        refinementOptions: result.refinement_options,
      },
    ]);
    // Instrumentação (Fase C): refinamento iniciado.
    track({
      event: "recova_refinement_started",
      session_id: sessionId,
      interaction_type: "refinement",
      products_shown: result.products.length,
    });
  };

  const close = () => {
    closedRef.current = true;
    if (reengageTimerRef.current) clearTimeout(reengageTimerRef.current);
    // Instrumentação (Fase C): fechamento do overlay.
    track({
      event: "recova_closed",
      session_id: sessionRef.current ?? undefined,
      interaction_type: "close",
    });
    onClose?.();
  };

  const isSuccess = flow.status === "success";

  // Conteúdo do diálogo (compartilhado entre popup e inline).
  const dialog = (
    <div
      role="dialog"
      aria-modal={variant === "popup"}
      aria-label={theme.copy.dialogAria}
      className={`relative flex w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl ${
        variant === "inline" ? "max-w-full" : "mx-3 mb-3 max-w-md sm:mb-0"
      } ${isSuccess ? "ring-2" : ""}`}
      style={{
        fontFamily: theme.fonts.body,
        ...(isSuccess ? { boxShadow: `0 0 0 2px ${theme.colors.success}` } : {}),
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          backgroundColor: isSuccess ? theme.colors.success : theme.colors.headerBg,
          color: theme.colors.headerText,
        }}
      >
        <div className="flex items-center gap-2">
          {theme.logo ? (
            <img
              src={theme.logo}
              alt={theme.brandName}
              className="h-8 w-auto"
            />
          ) : (
            <span
              className="flex size-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: theme.colors.primary }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 12c0-4.4 3.6-8 8-8 2.2 0 4.2 0.9 5.7 2.3" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                <path d="M20 12c0 4.4-3.6 8-8 8-2.2 0-4.2-0.9-5.7-2.3" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                <path d="M12 4v8l4 4" stroke={theme.colors.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="2" fill={theme.colors.accent} />
              </svg>
            </span>
          )}
          <div>
            <p className="text-sm font-bold" style={{ fontFamily: theme.fonts.display }}>
              {isSuccess ? theme.copy.buySuccessTitle : theme.brandName}
            </p>
            <p className="text-2xs opacity-80">
              {isSuccess
                ? theme.copy.buySuccessSubtitle
                : `${theme.copy.recoveryPrefix} "${term}"`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={theme.copy.closeAria}
          className="flex size-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/20"
        >
          ✕
        </button>
      </div>

      {/* Corpo */}
      <div
        className="flex max-h-[50vh] min-h-40 flex-col gap-3 overflow-y-auto p-4"
        style={{ backgroundColor: theme.colors.surface }}
      >
        {flow.status === "loading" && (
          <div className="flex items-center gap-2 text-sm" style={{ color: theme.colors.muted }}>
            <span className="loading loading-spinner loading-xs" />
            {theme.copy.loading}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-line rounded-lg px-3 py-2 text-sm ${
                msg.role === "user" ? "" : "shadow-sm"
              }`}
              style={
                msg.role === "user"
                  ? { backgroundColor: theme.colors.headerBg, color: theme.colors.headerText }
                  : { backgroundColor: theme.colors.cardBg, color: theme.colors.text }
              }
            >
              {msg.text}
            </div>

            {msg.role === "agent" && msg.products && msg.products.length > 0 && (
              <div className="flex w-full flex-col gap-2">
                {/* Carrossel horizontal de produtos (decisão 09/08): arrastável,
                    com scroll-snap e auto-play (passa sozinho por padrão, pausa
                    quando o usuário interage). Não é lista vertical comprida. */}
                <ProductCarousel
                  products={msg.products}
                  theme={theme}
                  onAddToCart={handleAddToCart}
                  onProductClick={(p) => {
                    // Instrumentação (Fase C): clique em alternativa.
                    track({
                      event: "recova_product_clicked",
                      session_id: sessionRef.current ?? undefined,
                      interaction_type: "product_click",
                      product_id: p.id,
                      price: p.price,
                    });
                  }}
                />
              </div>
            )}
          </div>
        ))}

        {/* Chips de refinamento dinâmicos vindos do backend (última mensagem do agente) */}
        {(() => {
          const lastAgent = [...messages].reverse().find((m) => m.role === "agent");
          const chips = lastAgent?.role === "agent" ? lastAgent.refinementOptions : undefined;
          if (!chips || chips.length === 0 || isSuccess) return null;
          return (
            <div
              className="flex flex-col gap-2 rounded-lg border p-3"
              style={{
                backgroundColor: theme.colors.cardBg,
                borderColor: theme.colors.border,
              }}
            >
              <p className="text-sm font-bold" style={{ color: theme.colors.text }}>
                Continuar refinando:
              </p>
              <div className="flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleSend(chip)}
                    disabled={thinking}
                    className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{
                      backgroundColor: theme.colors.primary,
                      color: "#FFFFFF",
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {thinking && (
          <div className="flex items-center gap-2 text-sm" style={{ color: theme.colors.muted }}>
            <span className="loading loading-spinner loading-xs" />
            {theme.copy.thinking}
          </div>
        )}

        {isSuccess && (
          <div
            className="rounded-lg p-3 text-sm"
            style={{
              backgroundColor: `${theme.colors.success}1A`,
              color: theme.colors.success,
            }}
          >
            Obrigado! Sua compra foi registrada.
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input (escondido no estado terminal) */}
      {!isSuccess && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2 border-t bg-white p-3"
          style={{ borderColor: theme.colors.border }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder={theme.copy.inputPlaceholder}
            className="grow rounded-md border px-3 py-2 text-sm outline-none"
            style={{
              borderColor: theme.colors.border,
              color: theme.colors.text,
            }}
            disabled={thinking || flow.status === "loading"}
          />
          <button
            type="submit"
            disabled={thinking || flow.status === "loading" || !input.trim()}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ backgroundColor: theme.colors.primary }}
          >
            {theme.copy.send}
          </button>
        </form>
      )}

      {/* Powered by Recova (free tier) — clicável → landing page */}
      {theme.showRecovaBranding && (
        <a
          href={theme.copy.poweredByUrl ?? "https://recova.app"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 border-t px-3 py-1.5 text-2xs hover:underline"
          style={{ borderColor: theme.colors.border, color: theme.colors.muted }}
        >
          {theme.copy.poweredBy ?? "Powered by Recova"}
        </a>
      )}
    </div>
  );

  // Variante inline: renderiza em fluxo (embaixo da barra de busca), sem
  // portal nem backdrop — não é pop-up (decisão da reunião 09/08).
  if (variant === "inline") {
    return <div style={cssVars as React.CSSProperties}>{dialog}</div>;
  }

  // Variante popup (default): overlay fixo em tela cheia.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      style={cssVars as React.CSSProperties}
    >
      <button
        type="button"
        aria-label={theme.copy.closeAria}
        onClick={close}
        className="absolute inset-0 cursor-default bg-ink/40 backdrop-blur-sm"
      />
      {dialog}
    </div>,
    document.body,
  );
}
