import type { ProductListingPage } from "@decocms/apps-commerce/types";
import { BreadcrumbJsonLd, PLPJsonLd } from "@decocms/blocks/hooks";
import { mapProductToAnalyticsItem } from "@decocms/apps-commerce/utils/productToAnalyticsItem";
import { useId, useRef, useState, useEffect } from "react";
import { useOffer } from "@decocms/apps-commerce/sdk/useOffer";
import { useRouterState } from "@tanstack/react-router";
import { useSendEvent } from "../../sdk/useSendEvent";
import { type SectionProps } from "~/types/deco";
import Breadcrumb from "../ui/Breadcrumb";
import Filters from "./Filters";
import SearchFilterDrawer from "./SearchFilterDrawer";
import SearchPagination, { rebasePaginationHrefs } from "./SearchPagination";
import SearchRecoveryOverlay from "./SearchRecoveryOverlay";
import SearchResultGrid from "./SearchResultGrid";
import SearchResultGridSkeleton from "./SearchResultGridSkeleton";
import SearchSortBar from "./SearchSortBar";
import { invoke } from "../../runtime";

/**
 * Emite um evento real de instrumentação (Fase C — dashboard 100% dados
 * reais). Best-effort: nunca quebra o fluxo se falhar.
 */
function track(event: Record<string, unknown>): void {
  invoke.site.loaders
    .searchRecovery({ action: "track_event", event })
    .catch(() => {
      // instrumentação é best-effort
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

export interface Layout {
  /**
   * @title Pagination
   * @description Format of the pagination
   * @default "show-more"
   */
  pagination?: "show-more" | "pagination";
  /**
   * @title Pré-carregar página do produto
   * @description Quando ativado, a página do produto começa a carregar assim
   * que o usuário passa o mouse sobre o card, deixando a navegação mais rápida.
   * Pode aumentar o consumo de dados em listas muito grandes.
   * @default true
   */
  enablePrefetch?: boolean;
}

export interface Props {
  /** @title Integration */
  page: ProductListingPage | null;
  /** @title Layout */
  layout?: Layout;
  /**
   * @title Starting page
   * @description 0 for ?page=0 as your first page
   * @default 0
   */
  startingPage?: 0 | 1;
}

function NotFound() {
  return (
    <div className="flex w-full items-center justify-center py-28">
      <span className="text-display font-medium text-ink">No results found</span>
    </div>
  );
}

function Result({
  page,
  layout,
  startingPage = 0,
  url,
}: SectionProps<typeof loader> & { page: ProductListingPage }) {
  const filterDrawerId = useId();
  // Termo da busca atual (para o agente de recuperação em zero results)
  const [recoveryTerm, setRecoveryTerm] = useState<string | null>(null);
  // Termos que o usuário fechou manualmente — não reabrir automaticamente
  const dismissedTermsRef = useRef<Set<string>>(new Set());

  // Use the live URL for filter/sort/pagination link rebasing. The section
  // loader's `url` is the SSR URL — on client navigation the page re-renders
  // with the new route loader's data, and this hook drives client-side links.
  const href = useRouterState({ select: (s) => s.location.href }) || url;

  // Show a grid-only skeleton while the route is transitioning to a new URL
  // (filter/sort/pagination click). Filters/breadcrumb/sort stay mounted.
  const isRouteLoading = useRouterState({ select: (s) => s.isLoading });

  const { products, filters, breadcrumb, pageInfo, sortOptions } = page;
  const perPage = pageInfo?.recordPerPage || products.length;
  const zeroIndexedOffsetPage = pageInfo.currentPage - startingPage;
  const offset = zeroIndexedOffsetPage * perPage;
  const { prev, next } = rebasePaginationHrefs(pageInfo.previousPage, pageInfo.nextPage, href);

  // Zero resultados → agente de recuperação entra automaticamente
  const searchTerm = new URL(href, "http://local").searchParams.get("q");
  const isZeroResults = products.length === 0 && Boolean(searchTerm);
  if (
    isZeroResults &&
    searchTerm &&
    recoveryTerm !== searchTerm &&
    !dismissedTermsRef.current.has(searchTerm)
  ) {
    setRecoveryTerm(searchTerm);
  }

  // Instrumentação (Fase C): busca realizada + zero results — alimenta o dashboard.
  useEffect(() => {
    if (!searchTerm) return;
    track({
      event: "search_performed",
      query_hash: hashQuery(searchTerm),
    });
    if (isZeroResults) {
      track({
        event: "search_zero_results",
        query_hash: hashQuery(searchTerm),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, isZeroResults]);

  const viewItemListEvent = useSendEvent({
    on: "view",
    event: {
      name: "view_item_list",
      params: {
        item_list_name: breadcrumb.itemListElement?.at(-1)?.name,
        item_list_id: breadcrumb.itemListElement?.at(-1)?.item,
        items: products?.map((product, index) =>
          mapProductToAnalyticsItem({
            ...useOffer(product.offers),
            index: offset + index,
            product,
            breadcrumbList: breadcrumb,
          }),
        ),
      },
    },
  });

  return (
    <div {...viewItemListEvent} className="w-full">
      <div className="container flex w-full flex-col gap-5 px-3 pt-4 pb-4 sm:gap-8 sm:pt-6 sm:pb-6">
        {recoveryTerm && (
          <SearchRecoveryOverlay
            term={recoveryTerm}
            variant="inline"
            onClose={() => {
              dismissedTermsRef.current.add(recoveryTerm);
              setRecoveryTerm(null);
            }}
          />
        )}
        {/* SEO: schema.org JSON-LD, server-rendered inline (crawlers read it anywhere in the document) */}
        <PLPJsonLd page={page} />
        {breadcrumb && <BreadcrumbJsonLd breadcrumb={breadcrumb} />}
        <Breadcrumb itemListElement={breadcrumb?.itemListElement} />

        <SearchFilterDrawer id={filterDrawerId} filters={filters} baseUrl={href} />

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-[220px_1fr]">
          <aside className="hidden flex-col gap-6 place-self-start sm:flex">
            <span className="text-sm font-medium text-ink-soft">Filters</span>
            <Filters filters={filters} baseUrl={href} />
          </aside>

          <div className="flex flex-col gap-6">
            <SearchSortBar
              recordPerPage={pageInfo.recordPerPage ?? products.length}
              totalRecords={pageInfo.records ?? products.length}
              sortOptions={sortOptions}
              url={href}
              filterDrawerId={filterDrawerId}
            />

            {isRouteLoading ? (
              <SearchResultGridSkeleton count={Math.min(perPage, 12) || 8} />
            ) : (
              <SearchResultGrid
                products={products}
                offset={offset}
                prefetch={layout?.enablePrefetch === false ? false : "intent"}
              />
            )}

            <div className="grid place-items-center pt-2 sm:pt-8">
              <SearchPagination
                currentPage={zeroIndexedOffsetPage + 1}
                prev={prev}
                next={next}
                variant={layout?.pagination ?? "show-more"}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const loader = (props: Props, req: Request) => ({
  ...props,
  url: req.url,
});

export default function SearchResult({ page, ...props }: SectionProps<typeof loader>) {
  if (!page) return <NotFound />;
  return <Result {...props} page={page} />;
}
