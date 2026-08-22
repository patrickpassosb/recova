import type { ProductListingPage } from "@decocms/apps-commerce/types";
import { BreadcrumbJsonLd, PLPJsonLd } from "@decocms/blocks/hooks";
import { mapProductToAnalyticsItem } from "@decocms/apps-commerce/utils/productToAnalyticsItem";
import { useEffect, useId, useState } from "react";
import { useOffer } from "@decocms/apps-commerce/sdk/useOffer";
import { useRouterState } from "@tanstack/react-router";
import { useSendEvent } from "../../sdk/useSendEvent";
import { type SectionProps } from "~/types/deco";
import Breadcrumb from "../ui/Breadcrumb";
import Filters from "./Filters";
import SearchFilterDrawer from "./SearchFilterDrawer";
import SearchPagination, { rebasePaginationHrefs } from "./SearchPagination";
import DecisionCards from "./DecisionCards";
import SearchResultGrid from "./SearchResultGrid";
import SearchResultGridSkeleton from "./SearchResultGridSkeleton";
import SearchSortBar from "./SearchSortBar";
import { invoke } from "../../runtime";
import type { RecoveryDecision } from "../../loaders/recoveryGateway";

function track(event: Record<string, unknown>): void {
  invoke.site.loaders.searchRecovery({ action: "track_event", event }).catch(() => {
    // Instrumentação é best-effort e não interfere na busca.
  });
}

function hashQuery(query: string): string {
  let hash = 0;
  for (let index = 0; index < query.length; index++) {
    hash = (hash * 31 + query.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(16);
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
  const searchTerm = new URL(href, "http://local").searchParams.get("q");
  const isZeroResults = !isRouteLoading && products.length === 0 && Boolean(searchTerm);

  const [recoveryDecision, setRecoveryDecision] = useState<RecoveryDecision | null>(null);

  useEffect(() => {
    if (!searchTerm || !isZeroResults) {
      setRecoveryDecision(null);
      return;
    }
    let cancelled = false;
    invoke.site.loaders
      .recoveryGateway({ query: searchTerm, nativeResultIds: [] })
      .then((decision: RecoveryDecision | null) => {
        if (!cancelled) setRecoveryDecision(decision);
      })
      .catch(() => {
        if (!cancelled) setRecoveryDecision(null);
      });
    return () => {
      cancelled = true;
    };
  }, [searchTerm, isZeroResults]);

  useEffect(() => {
    if (!searchTerm) return;
    track({ event: "search_performed", query_hash: hashQuery(searchTerm) });
  }, [searchTerm]);

  useEffect(() => {
    if (!searchTerm || !isZeroResults) return;
    track({ event: "search_zero_results", query_hash: hashQuery(searchTerm) });
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
      <div
        className={`container flex w-full flex-col gap-5 px-3 pb-4 sm:gap-8 sm:pb-6 ${
          isZeroResults ? "pt-20 sm:pt-24" : "pt-4 sm:pt-6"
        }`}
      >
        {isZeroResults && searchTerm && recoveryDecision && (
          <DecisionCards decision={recoveryDecision} query={searchTerm} />
        )}
        {/* SEO: schema.org JSON-LD, server-rendered inline (crawlers read it anywhere in the document) */}
        <PLPJsonLd page={page} />
        {breadcrumb && <BreadcrumbJsonLd breadcrumb={breadcrumb} />}
        <Breadcrumb itemListElement={breadcrumb?.itemListElement} />

        <SearchFilterDrawer id={filterDrawerId} filters={filters} baseUrl={href} />

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-[220px_1fr]">
          <aside className="hidden flex-col gap-6 place-self-start sm:flex">
            <span className="text-sm font-medium text-ink-soft">Filtros</span>
            <Filters filters={filters} baseUrl={href} />
          </aside>

          <div className="flex flex-col gap-6">
            <SearchSortBar
              recordPerPage={pageInfo.recordPerPage ?? products.length}
              totalRecords={pageInfo.records ?? products.length}
              sortOptions={sortOptions}
              url={href}
              filterDrawerId={filterDrawerId}
              hideEmptyCount={isZeroResults}
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
