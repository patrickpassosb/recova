/**
 * recovaTheme — sistema de tema white-label do overlay Recova.
 *
 * Modelo estilo Tidio:
 * - Free tier: branding Recova obrigatório (default).
 * - Planos pagos: customização total — o cliente define logo, cores, fontes,
 *   copy e pode remover qualquer menção à Recova (ex: Amazon com a marca dela).
 *
 * O tema é resolvido por `resolveTheme(config)` e consumido via CSS variables
 * no componente, para que a customização não exija mudanças de código.
 */

export interface RecovaTheme {
  /** Logo do cliente (URL ou data-URI). Vazio = sem logo. */
  logo?: string;
  /** Nome exibido no header (ex: "Recova", "Amazon", "Loja X"). */
  brandName: string;
  /** Subtítulo do header. */
  tagline: string;
  /** Badge do header (ex: "Shopping Agent"). Vazio = sem badge. */
  badge?: string;
  /** Cores (hex). */
  colors: {
    primary: string; // CTAs, links, chip ativo
    headerBg: string; // fundo do header
    headerText: string; // texto do header
    accent: string; // acento de intervenção (ex: laranja)
    success: string; // estado verde
    danger: string; // estado vermelho
    surface: string; // fundo do corpo
    cardBg: string; // fundo dos cards de produto
    text: string; // texto principal
    muted: string; // texto secundário
    border: string; // bordas
  };
  /** Fontes (famílias CSS). */
  fonts: {
    display: string;
    body: string;
  };
  /** Copy do agente. */
  copy: {
    agentIntro: string; // prefixo da mensagem ("Entendi.")
    buySuccess: string; // confirmação de compra
    buySuccessTitle: string;
    buySuccessSubtitle: string;
    failedTitle: string;
    failedSubtitle: string;
    failedBody: string;
    loading: string;
    thinking: string;
    inputPlaceholder: string;
    send: string;
    buy: string;
    closeAria: string;
    dialogAria: string;
    recoveryPrefix: string; // "Recuperando resultados para"
    poweredBy?: string; // "Powered by Recova" (opcional, free tier)
  };
  /** Pergunta de refinamento + chips (1 pergunta, junto com os produtos). */
  refinement?: {
    question: string;
    chips: string[];
  };
  /** Se o branding Recova deve aparecer (free tier = true). */
  showRecovaBranding: boolean;
}

/** Tema padrão — identidade Recova (free tier). */
export const recovaDefaultTheme: RecovaTheme = {
  logo: undefined,
  brandName: "Recova",
  tagline: "A segunda chance da sua busca",
  badge: "Shopping Agent",
  colors: {
    primary: "#155EEF",
    headerBg: "#102A43",
    headerText: "#FFFFFF",
    accent: "#F97316",
    success: "#16A34A",
    danger: "#DC2626",
    surface: "#F4F7FA",
    cardBg: "#FFFFFF",
    text: "#1D2939",
    muted: "#64748B",
    border: "#E2E8F0",
  },
  fonts: {
    display: "Manrope, sans-serif",
    body: "Inter, sans-serif",
  },
  copy: {
    agentIntro: "Entendi.",
    buySuccess: "Ótima escolha! Adicionei {product} ({price}) ao carrinho.",
    buySuccessTitle: "Compra concluída!",
    buySuccessSubtitle: "Venda recuperada pela Recova",
    failedTitle: "Sem conversão",
    failedSubtitle: "Cliente não adicionou nada ao carrinho",
    failedBody:
      "O cliente não respondeu às perguntas nem adicionou nada ao carrinho. Fluxo encerrado sem conversão.",
    loading: "Buscando produtos relevantes...",
    thinking: "Pensando...",
    inputPlaceholder: "Responda ao assistente...",
    send: "Enviar",
    buy: "Comprar",
    closeAria: "Fechar",
    dialogAria: "Recova — assistente de busca",
    recoveryPrefix: "Recuperando resultados para",
  },
  showRecovaBranding: true,
};

/**
 * Exemplo de tema customizado (white-label total) — uma loja fictícia
 * "Amazon" com a marca dela, sem nenhuma menção à Recova.
 */
export const amazonWhiteLabelTheme: RecovaTheme = {
  ...recovaDefaultTheme,
  brandName: "Amazon",
  tagline: "Encontre o que você procura",
  badge: "Assistente de compras",
  colors: {
    ...recovaDefaultTheme.colors,
    primary: "#FF9900",
    headerBg: "#131A22",
    headerText: "#FFFFFF",
    accent: "#FF9900",
    surface: "#F5F6F7",
    cardBg: "#FFFFFF",
    text: "#0F1111",
    muted: "#565959",
    border: "#D5D9D9",
  },
  copy: {
    ...recovaDefaultTheme.copy,
    buySuccessTitle: "Compra concluída!",
    buySuccessSubtitle: "Adicionado ao carrinho",
    dialogAria: "Assistente de compras",
    recoveryPrefix: "Encontre alternativas para",
  },
  showRecovaBranding: false,
};

export type RecovaThemeConfig = Partial<RecovaTheme> & {
  colors?: Partial<RecovaTheme["colors"]>;
  fonts?: Partial<RecovaTheme["fonts"]>;
  copy?: Partial<RecovaTheme["copy"]>;
  refinement?: Partial<RecovaTheme["refinement"]>;
};

/** Resolve um tema parcial sobre o default Recova. */
export function resolveTheme(config?: RecovaThemeConfig): RecovaTheme {
  if (!config) return recovaDefaultTheme;
  return {
    ...recovaDefaultTheme,
    ...config,
    colors: { ...recovaDefaultTheme.colors, ...config.colors },
    fonts: { ...recovaDefaultTheme.fonts, ...config.fonts },
    copy: { ...recovaDefaultTheme.copy, ...config.copy },
    ...(config.refinement
      ? { refinement: { ...recovaDefaultTheme.refinement, ...config.refinement } }
      : {}),
  };
}

/** Converte o tema em CSS variables para o overlay. */
export function themeToCssVars(theme: RecovaTheme): Record<string, string> {
  return {
    "--recova-primary": theme.colors.primary,
    "--recova-header-bg": theme.colors.headerBg,
    "--recova-header-text": theme.colors.headerText,
    "--recova-accent": theme.colors.accent,
    "--recova-success": theme.colors.success,
    "--recova-danger": theme.colors.danger,
    "--recova-surface": theme.colors.surface,
    "--recova-card-bg": theme.colors.cardBg,
    "--recova-text": theme.colors.text,
    "--recova-muted": theme.colors.muted,
    "--recova-border": theme.colors.border,
    "--recova-font-display": theme.fonts.display,
    "--recova-font-body": theme.fonts.body,
  };
}
