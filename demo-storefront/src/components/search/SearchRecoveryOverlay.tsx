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
import type { RecoveryProduct, RecoveryResult } from "../../loaders/searchRecovery";
import {
  recovaDefaultTheme,
  resolveTheme,
  themeToCssVars,
  type RecovaTheme,
  type RecovaThemeConfig,
} from "./recovaTheme";

// Logos Recova oficiais do vault (free tier).
const recovaLogoDark = "/recova/logo-horizontal.svg";
const recovaLogoLight = "/recova/logo-horizontal-branco.svg";

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
  /** Distribuição do Coverflow: mascarado na busca, amplo na página de resultados. */
  carouselLayout?: "masked" | "wide";
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

export function getLatestRefinementOptions(
  messages: Array<{ role: "agent" | "user"; refinementOptions?: string[] }>,
): string[] | undefined {
  return [...messages]
    .reverse()
    .find((message) => message.role === "agent" && message.refinementOptions?.length)
    ?.refinementOptions;
}

type FlowState =
  | { status: "loading" }
  | { status: "chat" }
  | { status: "success" } // ✅ verde (comprou)
  | { status: "failed" }; // ❌ vermelho (desistiu — reengajamento esgotado)

const REENGAGEMENT_DELAY_MS = 60_000;

export function getReengagementDelay(lastActivityAt: number, now = Date.now()): number {
  return Math.max(0, REENGAGEMENT_DELAY_MS - (now - lastActivityAt));
}

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
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
  invoke.site.loaders.searchRecovery({ action: "track_event", event }).catch(() => {
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
 * Carrossel de produtos horizontal com scroll-snap (brand book Recova).
 * Cada card é totalmente interativo: imagem, título, descrição e os 2 botões
 * (Comprar / Adicionar ao carrinho). Sem cards "fantasma" sobrepostos.
 */
function ProductCarousel({
  products,
  theme,
  onAddToCart,
  onProductClick,
  isAddingToCart,
  autoPlay,
  layout,
}: {
  products: RecoveryProduct[];
  theme: RecovaTheme;
  onAddToCart: (p: RecoveryProduct, goToCheckout: boolean) => void;
  onProductClick: (p: RecoveryProduct) => void;
  isAddingToCart: boolean;
  autoPlay: boolean;
  layout: "masked" | "wide";
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [rotationPaused, setRotationPaused] = useState(false);
  const pausedRef = useRef(false);

  const cardWidth = layout === "masked" ? 240 : 320;
  const cardHeight = layout === "masked" ? "h-[22.5rem]" : "h-[27.5rem]";

  // Autoplay: avança o scroll suavemente a cada 3s (pausa em hover/foco/toque).
  useEffect(() => {
    if (!autoPlay || products.length <= 1 || rotationPaused) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;
    const id = setInterval(() => {
      const track = trackRef.current;
      if (!track || pausedRef.current || document.hidden) return;
      const next = track.scrollLeft + cardWidth;
      if (next >= track.scrollWidth - track.clientWidth - 4) {
        track.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        track.scrollTo({ left: next, behavior: "smooth" });
      }
    }, 3000);
    return () => clearInterval(id);
  }, [autoPlay, products.length, rotationPaused, cardWidth]);

  const move = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * cardWidth, behavior: "smooth" });
  };

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Produtos recomendados"
      data-carousel-layout={layout}
      className="relative w-full py-2"
      onMouseEnter={() => {
        pausedRef.current = true;
      }}
      onMouseLeave={() => {
        pausedRef.current = false;
      }}
      onFocus={() => {
        pausedRef.current = true;
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          pausedRef.current = false;
        }
      }}
      onTouchStart={() => {
        pausedRef.current = true;
      }}
      onTouchEnd={() => {
        pausedRef.current = false;
      }}
    >
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1"
        style={{ scrollPaddingInline: "max(1rem, calc((100% - 42rem) / 2))" }}
      >
        {products.map((p, index) => {
          const url = productUrl(p.handle);
          return (
            <article
              key={p.id}
              data-card
              role="group"
              aria-roledescription="slide"
              aria-label={`Produto ${index + 1} de ${products.length}`}
              className={`${cardHeight} flex shrink-0 snap-center flex-col gap-2 overflow-hidden rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md`}
              style={{
                backgroundColor: theme.colors.cardBg,
                borderColor: theme.colors.border,
                width: cardWidth,
              }}
            >
              {url ? (
                <a
                  href={url}
                  aria-label={`Ver ${p.title}`}
                  onClick={() => onProductClick(p)}
                  className="block focus-visible:ring-2"
                >
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.title}
                      className={`${layout === "masked" ? "h-28" : "h-[8.75rem]"} w-full rounded-md object-contain`}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div
                      className={`${layout === "masked" ? "h-28" : "h-[8.75rem]"} w-full rounded-md`}
                      style={{ backgroundColor: theme.colors.border }}
                    />
                  )}
                </a>
              ) : p.image ? (
                <img
                  src={p.image}
                  alt={p.title}
                  className={`${layout === "masked" ? "h-28" : "h-[8.75rem]"} w-full rounded-md object-contain`}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div
                  className={`${layout === "masked" ? "h-28" : "h-[8.75rem]"} w-full rounded-md`}
                  style={{ backgroundColor: theme.colors.border }}
                />
              )}
              <div className="min-h-0 min-w-0 flex-1">
                {url ? (
                  <a
                    href={url}
                    className="line-clamp-2 block text-sm font-medium leading-snug hover:underline focus-visible:ring-2"
                    style={{ color: theme.colors.text }}
                  >
                    {p.title}
                  </a>
                ) : (
                  <p
                    className="line-clamp-2 text-sm font-medium leading-snug"
                    style={{ color: theme.colors.text }}
                  >
                    {p.title}
                  </p>
                )}
                <p className="mt-0.5 text-xs font-semibold" style={{ color: theme.colors.primary }}>
                  {formatPrice(p.price)}
                </p>
                {p.description?.trim() && (
                  <p
                    className={
                      layout === "masked"
                        ? "mt-2 line-clamp-2 text-xs leading-relaxed"
                        : "mt-3 line-clamp-2 text-sm leading-relaxed"
                    }
                    style={{ color: theme.colors.muted }}
                  >
                    {p.description.trim()}
                  </p>
                )}
              </div>
              <div className="mt-auto flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onAddToCart(p, true)}
                  disabled={isAddingToCart}
                  className="flex-1 rounded-md px-2 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-80 focus-visible:ring-2 disabled:opacity-40"
                  style={{ backgroundColor: theme.colors.primary }}
                >
                  {theme.copy.buy}
                </button>
                <button
                  type="button"
                  onClick={() => onAddToCart(p, false)}
                  disabled={isAddingToCart}
                  className="flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 focus-visible:ring-2 disabled:opacity-40"
                  style={{
                    borderColor: theme.colors.primary,
                    color: theme.colors.primary,
                    backgroundColor: "transparent",
                  }}
                >
                  {theme.copy.addToCart}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {products.length > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1" aria-label="Controles do carrossel">
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="Produto anterior"
            className="flex size-10 items-center justify-center rounded-full border text-lg focus-visible:ring-2"
            style={{ borderColor: theme.colors.border, color: theme.colors.primary }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setRotationPaused((paused) => !paused)}
            aria-label={rotationPaused ? "Retomar rotação" : "Pausar rotação"}
            className="flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-xs font-semibold focus-visible:ring-2"
            style={{ borderColor: theme.colors.border, color: theme.colors.primary }}
          >
            {rotationPaused ? "▶" : "Ⅱ"}
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="Próximo produto"
            className="flex size-10 items-center justify-center rounded-full border text-lg focus-visible:ring-2"
            style={{ borderColor: theme.colors.border, color: theme.colors.primary }}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

export default function SearchRecoveryOverlay({
  term,
  onClose,
  theme: themeConfig,
  variant = "popup",
  carouselLayout,
}: SearchRecoveryOverlayProps) {
  const theme = resolveTheme(themeConfig);
  const resolvedCarouselLayout = carouselLayout ?? (variant === "popup" ? "masked" : "wide");
  const cssVars = themeToCssVars(theme);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [flow, setFlow] = useState<FlowState>({ status: "loading" });
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const closedRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollTermRef = useRef(term);
  const initialResponsePendingRef = useRef(true);
  // Carrinho real (Shopify via server fn) — "Comprar"/"Adicionar" adicionam de verdade.
  const addToCart = useAddToCart();
  const { cart } = useCart();
  // Timer de reengajamento (1 min de inatividade → nova mensagem + som)
  const reengageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Uma nova busca começa no topo; respostas posteriores acompanham o fim do chat.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (scrollTermRef.current !== term) {
      scrollTermRef.current = term;
      initialResponsePendingRef.current = true;
      container.scrollTop = 0;
      return;
    }

    const latestMessage = messages.at(-1);
    if (initialResponsePendingRef.current) {
      container.scrollTop = 0;
      if (latestMessage?.role === "agent") initialResponsePendingRef.current = false;
      return;
    }

    if (latestMessage?.role === "agent") container.scrollTop = container.scrollHeight;
  }, [messages, term]);

  // Abre a conversa automaticamente quando o overlay monta (zero results)
  useEffect(() => {
    let cancelled = false;
    initialResponsePendingRef.current = true;
    sessionRef.current = null;
    setMessages([]);
    setFlow({ status: "loading" });

    const start = async () => {
      let result: RecoveryResult | null = null;
      try {
        result = (await invoke.site.loaders.searchRecovery({
          query: term,
          action: "search_recovery",
        })) as RecoveryResult | null;
      } catch {
        // A mensagem de fallback abaixo mantém o chat recuperável.
      }

      if (cancelled || closedRef.current) return;
      if (!result) {
        setMessages([
          {
            role: "agent",
            text: "Não consegui encontrar uma opção confiável agora. Você pode tentar outra busca.",
          },
        ]);
        setFlow({ status: "chat" });
        lastActivityRef.current = Date.now();
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
      lastActivityRef.current = Date.now();
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

  // Reengajamento: no máximo 2 mensagens, separadas por 1 minuto.
  useEffect(() => {
    if (flow.status !== "chat" || closedRef.current) return;

    const schedule = () => {
      if (reengageTimerRef.current) clearTimeout(reengageTimerRef.current);
      reengageTimerRef.current = setTimeout(async () => {
        if (closedRef.current || flow.status !== "chat") return;
        if (getReengagementDelay(lastActivityRef.current) > 0) {
          schedule();
          return;
        }
        const sessionId = sessionRef.current;
        if (!sessionId) return;
        let exhausted = false;
        try {
          const result = (await invoke.site.loaders.searchRecovery({
            session_id: sessionId,
            action: "reengage",
          })) as { message?: string; exhausted?: boolean } | null;
          exhausted = result?.exhausted ?? false;
          if (closedRef.current) return;
          if (result?.message) {
            playAlertSound();
            setMessages((prev) => [...prev, { role: "agent", text: result.message! }]);
            // Instrumentação (Fase C): reengajamento.
            track({
              event: "recova_reengaged",
              session_id: sessionId,
              interaction_type: "reengagement",
            });
          }
          // Reengajamento esgotado (máx 2 tentativas) e cliente não converteu
          // → estado terminal ❌ vermelho (desistiu).
          if (exhausted) {
            setFlow({ status: "failed" });
            track({
              event: "recova_abandoned",
              session_id: sessionId,
              interaction_type: "abandoned",
            });
          }
        } catch {
          // reengajamento é best-effort — nunca quebra o chat
        }
        if (!exhausted) schedule();
      }, getReengagementDelay(lastActivityRef.current));
    };

    schedule();
    return () => {
      if (reengageTimerRef.current) clearTimeout(reengageTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.status]);

  // Cliente comprou uma sugestão → adiciona ao carrinho REAL (Shopify).
  // "Comprar" adiciona e vai ao checkout; "Adicionar ao carrinho" só adiciona.
  const handleAddToCart = (product: RecoveryProduct, goToCheckout: boolean) => {
    lastActivityRef.current = Date.now();
    setMessages((prev) => [...prev, { role: "user", text: `Quero comprar: ${product.title}` }]);
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
          // Instrumentação (Fase C): clique em alternativa (CTA do card).
          track({
            event: "recova_product_clicked",
            session_id: sessionRef.current ?? undefined,
            interaction_type: "product_click",
            product_id: product.id,
            price: product.price,
          });
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
            const checkoutUrl = cartState.checkoutUrl;
            if (!checkoutUrl) {
              setMessages((prev) => [
                ...prev,
                {
                  role: "agent",
                  text: "O item foi adicionado, mas não consegui abrir o checkout. Você pode finalizar pela sacola.",
                },
              ]);
              setFlow({ status: "chat" });
              return;
            }
            // Instrumentação (Fase C): checkout iniciado — distingue venda
            // real de carrinho abandonado no dashboard. Emitido no clique
            // "Comprar" (intenção de finalizar), antes da navegação.
            track({
              event: "checkout_started",
              session_id: sessionRef.current ?? undefined,
              exposed_session_id: sessionRef.current ?? undefined,
              product_id: product.id,
              price: product.price,
            });
            window.location.href = checkoutUrl;
            return;
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
    lastActivityRef.current = Date.now();

    setMessages((prev) => [...prev, { role: "user", text }]);

    const sessionId = sessionRef.current;
    let result: RecoveryResult | null = null;
    try {
      result = (await invoke.site.loaders.searchRecovery(
        sessionId
          ? {
              session_id: sessionId,
              user_response: text,
              action: "converse",
            }
          : {
              query: text,
              action: "search_recovery",
            },
      )) as RecoveryResult | null;
    } catch {
      // O erro visível abaixo evita deixar a mensagem do cliente sem resposta.
    } finally {
      setThinking(false);
    }

    if (closedRef.current) return;
    if (!result) {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: "Ainda não consegui acessar as recomendações. Tente enviar sua mensagem novamente em instantes.",
        },
      ]);
      return;
    }

    sessionRef.current = result.session_id;
    lastActivityRef.current = Date.now();
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
      session_id: result.session_id,
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
  const isFailed = flow.status === "failed";
  const latestProductMessageIndex = messages.reduce(
    (latest, message, index) =>
      message.role === "agent" && message.products?.length ? index : latest,
    -1,
  );

  // Conteúdo compartilhado entre o popup e a seção inline.
  const dialog = (
    <div
      role={variant === "popup" ? "dialog" : "region"}
      aria-modal={variant === "popup" ? true : undefined}
      aria-label={theme.copy.dialogAria}
      className={`relative flex w-full flex-col overflow-hidden bg-white ${
        variant === "inline"
          ? "max-w-full rounded-md border"
          : `mx-3 mb-3 max-w-md rounded-xl shadow-2xl sm:mb-0 ${isSuccess ? "ring-2" : ""}`
      }`}
      style={{
        fontFamily: theme.fonts.body,
        ...(variant === "inline"
          ? { borderColor: isSuccess ? theme.colors.success : theme.colors.border }
          : isSuccess
            ? { boxShadow: `0 0 0 2px ${theme.colors.success}` }
            : {}),
      }}
    >
      {/* Header — identidade Recova limpa: navy sempre (verde reservado ao status no corpo). */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          backgroundColor: theme.colors.headerBg,
          color: theme.colors.headerText,
        }}
      >
        <div className="flex items-center gap-2.5">
          <img
            src={theme.logo ?? recovaLogoLight}
            alt={theme.brandName}
            className="h-6 w-auto object-contain"
          />
          {theme.tagline && (
            <span
              className="hidden text-xs font-medium text-white/70 sm:inline"
              style={{ fontFamily: theme.fonts.body }}
            >
              {theme.tagline}
            </span>
          )}
        </div>
        {variant === "popup" && (
          <button
            type="button"
            onClick={close}
            aria-label={theme.copy.closeAria}
            className="flex size-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/20"
          >
            ✕
          </button>
        )}
      </div>

      {/* Corpo */}
      <div
        ref={messagesContainerRef}
        data-chat-scroll
        className="flex max-h-[50vh] min-h-40 flex-col gap-3 overflow-y-auto p-4"
        style={{ backgroundColor: theme.colors.surface }}
      >
        {flow.status === "loading" && (
          <div className="flex items-center gap-2 text-sm" style={{ color: theme.colors.muted }}>
            <span className="loading loading-spinner loading-xs" />
            {theme.copy.loading}
          </div>
        )}

        {/* Mensagem explícita de zero resultados — o agente entrou porque a busca nativa não achou nada */}
        {flow.status === "chat" && (
          <div
            className="rounded-lg border p-3 text-sm"
            style={{
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.cardBg,
              color: theme.colors.text,
            }}
          >
            <p className="font-semibold" style={{ color: theme.colors.accent }}>
              Não encontramos exatamente "{term}"
            </p>
            <p className="mt-1" style={{ color: theme.colors.muted }}>
              Mas separamos algumas opções que podem atender ao que você procura. Veja abaixo e refine com os chips.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            {msg.role === "agent" && (
              <div className="flex items-center gap-1.5">
                <img
                  src="/recova/logo-icone.svg"
                  alt={theme.brandName}
                  className="size-5 rounded-full object-contain"
                  style={{ backgroundColor: theme.colors.primary }}
                />
              </div>
            )}
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
                {/* Chips de refinamento (acima do carrossel) quando a mensagem
                    traz opções — decisão do loop visual. */}
                {msg.refinementOptions && msg.refinementOptions.length > 0 && (
                  <div
                    className="flex flex-col gap-2 rounded-lg border p-3"
                    style={{
                      backgroundColor: theme.colors.cardBg,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <p className="text-sm font-bold" style={{ color: theme.colors.text }}>
                      O que você prefere?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {msg.refinementOptions.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => handleSend(chip)}
                          disabled={thinking}
                          className="rounded-full border px-3.5 py-2 text-xs font-semibold transition-all hover:opacity-80 focus-visible:ring-2 disabled:opacity-40"
                          style={{
                            borderColor: theme.colors.primary,
                            color: theme.colors.primary,
                            backgroundColor: "transparent",
                          }}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Carrossel horizontal de produtos (decisão 09/08): arrastável,
                    com scroll-snap e auto-play (passa sozinho por padrão, pausa
                    quando o usuário interage). Não é lista vertical comprida. */}
                <ProductCarousel
                  products={msg.products}
                  theme={theme}
                  onAddToCart={handleAddToCart}
                  isAddingToCart={addToCart.isPending}
                  autoPlay={i === latestProductMessageIndex}
                  layout={resolvedCarouselLayout}
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

        {/* Os chips de refinamento são renderizados acima de cada carrossel,
            junto da mensagem que os traz (decisão do loop visual). */}

        {thinking && (
          <div className="flex items-center gap-2 text-sm" style={{ color: theme.colors.muted }}>
            <span className="loading loading-spinner loading-xs" />
            {theme.copy.thinking}
          </div>
        )}

        {isSuccess && (
          <div
            className="flex flex-col gap-3 rounded-lg border p-3 text-sm"
            style={{
              backgroundColor: `${theme.colors.success}14`,
              borderColor: `${theme.colors.success}40`,
              color: theme.colors.text,
            }}
          >
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke={theme.colors.success} strokeWidth="2" />
                <path d="M8 12.5l2.5 2.5L16 9.5" stroke={theme.colors.success} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-semibold" style={{ color: theme.colors.success }}>
                {theme.copy.buySuccessTitle}
              </span>
            </div>
            <p className="text-sm" style={{ color: theme.colors.muted }}>
              {theme.copy.buySuccessSubtitle}.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const checkoutUrl = cart?.checkoutUrl;
                  if (checkoutUrl) window.location.href = checkoutUrl;
                }}
                className="flex-1 rounded-md px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-80"
                style={{ backgroundColor: theme.colors.primary }}
              >
                Finalizar compra
              </button>
              <button
                type="button"
                onClick={close}
                className="flex-1 rounded-md border px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-80"
                style={{
                  borderColor: theme.colors.primary,
                  color: theme.colors.primary,
                  backgroundColor: "transparent",
                }}
              >
                Continuar comprando
              </button>
            </div>
          </div>
        )}
        {isFailed && (
          <div
            className="flex flex-col gap-3 rounded-lg border p-3 text-sm"
            style={{
              backgroundColor: `${theme.colors.danger}14`,
              borderColor: `${theme.colors.danger}40`,
              color: theme.colors.text,
            }}
          >
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke={theme.colors.danger} strokeWidth="2" />
                <path d="M15 9l-6 6M9 9l6 6" stroke={theme.colors.danger} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-semibold" style={{ color: theme.colors.danger }}>
                {theme.copy.failedTitle}
              </span>
            </div>
            <p className="text-sm" style={{ color: theme.colors.muted }}>
              {theme.copy.failedSubtitle}.
            </p>
            <p className="text-sm" style={{ color: theme.colors.muted }}>
              {theme.copy.failedBody}
            </p>
            <button
              type="button"
              onClick={close}
              className="rounded-md border px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-80"
              style={{
                borderColor: theme.colors.primary,
                color: theme.colors.primary,
                backgroundColor: "transparent",
              }}
            >
              Fechar
            </button>
          </div>
        )}
      </div>

      {/* Input (escondido nos estados terminais) */}
      {!isSuccess && !isFailed && (
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
            onChange={(e) => {
              lastActivityRef.current = Date.now();
              setInput(e.currentTarget.value);
            }}
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
            disabled={thinking || flow.status === "loading"}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: theme.colors.primary }}
          >
            {theme.copy.send}
          </button>
        </form>
      )}

      {/* Powered by Recova (free tier) — apenas "Powered by" + logo wordmark. */}
      {theme.showRecovaBranding && (
        <a
          href={theme.copy.poweredByUrl ?? "https://recova.gabrielsacilotto.com.br/"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 border-t px-3 py-2 text-2xs hover:opacity-80"
          style={{ borderColor: theme.colors.border, color: theme.colors.muted }}
        >
          <span>Powered by</span>
          <img
            src={theme.logo ?? recovaLogoDark}
            alt={theme.brandName}
            className="h-5 w-auto object-contain"
          />
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
