/**
 * SearchRecoveryOverlay — o agente de recuperação de busca no storefront.
 *
 * Segue o fluxograma:
 * 1. Busca nativa retorna zero resultados → overlay abre automaticamente
 * 2. Agente entra como chat com 3+ produtos em <2s
 * 3. Cliente comprou uma sugestão → ✅ SUCESSO (verde)
 * 4. Cliente responde → 3+ produtos + explicação + nova pergunta (loop)
 * 5. Não respondeu → esperar 30s → nova mensagem (máx 2 tentativas)
 * 6. Loop esgotado → ❌ (vermelho)
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "../../runtime";
import type {
  RecoveryProduct,
  RecoveryResult,
  ReengageResult,
} from "../../loaders/searchRecovery";

export interface SearchRecoveryOverlayProps {
  /** Termo da busca que retornou zero resultados */
  term: string;
  /** Chamado quando o overlay fecha */
  onClose?: () => void;
}

type ChatMessage =
  | { role: "agent"; text: string; products?: RecoveryProduct[] }
  | { role: "user"; text: string };

type FlowState =
  | { status: "loading" }
  | { status: "chat" }
  | { status: "success" } // ✅ verde
  | { status: "failed" }; // ❌ vermelho

const REENGAGE_DELAY_MS = 30_000;
const MAX_REENGAGE_ATTEMPTS = 2;

function formatPrice(price: number): string {
  return `R$ ${price.toFixed(2).replace(".", ",")}`;
}

export default function SearchRecoveryOverlay({
  term,
  onClose,
}: SearchRecoveryOverlayProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [flow, setFlow] = useState<FlowState>({ status: "loading" });
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const reengageAttemptsRef = useRef(0);
  const reengageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
        setFlow({ status: "failed" });
        return;
      }

      sessionRef.current = result.session_id;
      setMessages([
        {
          role: "agent",
          text: `${result.explanation}\n\n${result.follow_up_question}`,
          products: result.products,
        },
      ]);
      setFlow({ status: "chat" });
      scheduleReengage();
    };

    start();
    return () => {
      cancelled = true;
      if (reengageTimerRef.current) clearTimeout(reengageTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  // Timer de reengajamento: 30s sem ação → nova mensagem (máx 2)
  const scheduleReengage = () => {
    if (reengageTimerRef.current) clearTimeout(reengageTimerRef.current);
    reengageTimerRef.current = setTimeout(async () => {
      if (closedRef.current || reengageAttemptsRef.current >= MAX_REENGAGE_ATTEMPTS) {
        return;
      }
      const sessionId = sessionRef.current;
      if (!sessionId) return;

      const result = (await invoke.site.loaders.searchRecovery({
        session_id: sessionId,
        action: "reengage",
      })) as ReengageResult | null;

      if (closedRef.current) return;
      if (!result) return;

      reengageAttemptsRef.current = result.attempt;
      setMessages((prev) => [...prev, { role: "agent", text: result.message }]);

      if (result.exhausted || result.attempt >= MAX_REENGAGE_ATTEMPTS) {
        setFlow({ status: "failed" }); // ❌ vermelho
      } else {
        scheduleReengage();
      }
    }, REENGAGE_DELAY_MS);
  };

  // Cliente comprou uma sugestão → ✅ verde
  const handleBuy = (product: RecoveryProduct) => {
    if (reengageTimerRef.current) clearTimeout(reengageTimerRef.current);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: `Quero comprar: ${product.title}` },
      {
        role: "agent",
        text: `Ótima escolha! 🎉 Adicionei ${product.title} (${formatPrice(product.price)}) ao carrinho.`,
      },
    ]);
    setFlow({ status: "success" });
  };

  // Cliente respondeu → converse (loop)
  const handleSend = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    setThinking(true);
    if (reengageTimerRef.current) clearTimeout(reengageTimerRef.current);

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
        { role: "agent", text: "Desculpe, não consegui processar agora. Pode repetir?" },
      ]);
      scheduleReengage();
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "agent",
        text: `${result.explanation}\n\n${result.follow_up_question}`,
        products: result.products,
      },
    ]);
    scheduleReengage();
  };

  const close = () => {
    closedRef.current = true;
    if (reengageTimerRef.current) clearTimeout(reengageTimerRef.current);
    onClose?.();
  };

  const isSuccess = flow.status === "success";
  const isFailed = flow.status === "failed";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Fechar assistente"
        onClick={close}
        className="absolute inset-0 cursor-default bg-ink/40 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Assistente de busca"
        className={`relative mx-3 mb-3 flex w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:mb-0 ${
          isSuccess ? "ring-2 ring-green-500" : isFailed ? "ring-2 ring-red-500" : ""
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 text-white ${
            isSuccess ? "bg-green-600" : isFailed ? "bg-red-600" : "bg-ink"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{isSuccess ? "✅" : isFailed ? "❌" : "🤖"}</span>
            <div>
              <p className="text-sm font-semibold">
                {isSuccess
                  ? "Compra concluída!"
                  : isFailed
                    ? "Sem conversão"
                    : "Assistente de busca"}
              </p>
              <p className="text-2xs opacity-80">
                {isSuccess
                  ? "Venda recuperada pelo agente"
                  : isFailed
                    ? "Cliente não adicionou nada ao carrinho"
                    : `Recuperando resultados para "${term}"`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Fechar"
            className="flex size-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/20"
          >
            ✕
          </button>
        </div>

        {/* Corpo */}
        <div className="flex max-h-[50vh] min-h-40 flex-col gap-3 overflow-y-auto bg-gray-50 p-4">
          {flow.status === "loading" && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <span className="loading loading-spinner loading-xs" />
              Buscando produtos relevantes...
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-line rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-ink text-white"
                    : "bg-white text-ink shadow-sm"
                }`}
              >
                {msg.text}
              </div>

              {msg.role === "agent" && msg.products && msg.products.length > 0 && (
                <div className="flex w-full flex-col gap-2">
                  {msg.products.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-2 shadow-sm"
                    >
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.title}
                          className="size-12 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="size-12 shrink-0 rounded-md bg-gray-200" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.title}</p>
                        <p className="text-xs text-gray-500">{formatPrice(p.price)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleBuy(p)}
                        disabled={isSuccess || isFailed}
                        className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-40"
                      >
                        Comprar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {thinking && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <span className="loading loading-spinner loading-xs" />
              Pensando...
            </div>
          )}

          {isSuccess && (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
              🎉 Obrigado! Sua compra foi registrada. O agente recuperou uma venda
              que a busca nativa teria perdido.
            </div>
          )}
          {isFailed && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              O cliente não respondeu às perguntas nem adicionou nada ao carrinho.
              Fluxo encerrado sem conversão.
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input (escondido nos estados terminais) */}
        {!isSuccess && !isFailed && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2 border-t border-gray-200 bg-white p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              placeholder="Responda ao assistente..."
              className="grow rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-ink"
              disabled={thinking || flow.status === "loading"}
            />
            <button
              type="submit"
              disabled={thinking || flow.status === "loading" || !input.trim()}
              className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink/80 disabled:opacity-40"
            >
              Enviar
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
