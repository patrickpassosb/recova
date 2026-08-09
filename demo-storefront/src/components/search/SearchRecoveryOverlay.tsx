/**
 * SearchRecoveryOverlay — o agente de recuperação de busca no storefront.
 *
 * Segue o fluxograma:
 * 1. Busca nativa retorna zero resultados → overlay abre automaticamente
 * 2. Agente entra como chat com 3+ produtos em <2s + 1 pergunta de refinamento
 *    com chips de resposta rápida (junto com os produtos, sem passo intermediário)
 * 3. Cliente comprou uma sugestão → ✅ SUCESSO (verde)
 * 4. Cliente responde (chip ou texto) → 3+ produtos + explicação + nova pergunta (loop)
 * 5. O chat fica aberto indefinidamente — o cliente pode demorar o tempo que
 *    quiser para responder; só fecha manualmente (✕)
 *
 * White-label (estilo Tidio): o tema é injetado via `theme` prop. Free tier usa
 * o tema Recova padrão; planos pagos permitem customização total (logo, cores,
 * fontes, copy) sem qualquer menção à Recova.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "../../runtime";
import { useAddToCart } from "../../platform/cart";
import type {
  RecoveryProduct,
  RecoveryResult,
} from "../../loaders/searchRecovery";
import {
  recovaDefaultTheme,
  resolveTheme,
  themeToCssVars,
  type RecovaThemeConfig,
} from "./recovaTheme";

export interface SearchRecoveryOverlayProps {
  /** Termo da busca que retornou zero resultados */
  term: string;
  /** Chamado quando o overlay fecha */
  onClose?: () => void;
  /** Tema white-label (opcional — default: Recova, free tier) */
  theme?: RecovaThemeConfig;
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

export default function SearchRecoveryOverlay({
  term,
  onClose,
  theme: themeConfig,
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
  // Carrinho real (Shopify via server fn) — "Comprar" agora adiciona de verdade.
  const addToCart = useAddToCart();

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
    };

    start();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  // Cliente comprou uma sugestão → adiciona ao carrinho REAL (Shopify).
  // Só mostra o estado verde ✅ quando a mutation do carrinho confirma.
  const handleBuy = (product: RecoveryProduct) => {
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
        onSuccess: () => {
          if (closedRef.current) return;
          setMessages((prev) => [
            ...prev,
            {
              role: "agent",
              text: `Ótima escolha! 🎉 Adicionei ${product.title} (${formatPrice(product.price)}) ao carrinho.`,
            },
          ]);
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
  };

  const close = () => {
    closedRef.current = true;
    onClose?.();
  };

  const isSuccess = flow.status === "success";

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
      <div
        role="dialog"
        aria-modal="true"
        aria-label={theme.copy.dialogAria}
        className={`relative mx-3 mb-3 flex w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:mb-0 ${
          isSuccess ? "ring-2" : ""
        }`}
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
                  {msg.products.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-lg border p-2 shadow-sm"
                      style={{
                        backgroundColor: theme.colors.cardBg,
                        borderColor: theme.colors.border,
                      }}
                    >
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.title}
                          className="size-12 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div
                          className="size-12 shrink-0 rounded-md"
                          style={{ backgroundColor: theme.colors.border }}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" style={{ color: theme.colors.text }}>
                          {p.title}
                        </p>
                        <p className="text-xs" style={{ color: theme.colors.muted }}>
                          {formatPrice(p.price)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleBuy(p)}
                        disabled={isSuccess}
                        className="rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                        style={{ backgroundColor: theme.colors.primary }}
                      >
                        {theme.copy.buy}
                      </button>
                    </div>
                  ))}
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

        {/* Powered by Recova (free tier) */}
        {theme.showRecovaBranding && (
          <div
            className="flex items-center justify-center gap-1 border-t px-3 py-1.5 text-2xs"
            style={{ borderColor: theme.colors.border, color: theme.colors.muted }}
          >
            {theme.copy.poweredBy ?? "Powered by Recova"}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
