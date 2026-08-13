import type { ProductListingPage } from "@decocms/apps-commerce/types";
import { useNavigate } from "@tanstack/react-router";

const SORT_QUERY_PARAM = "sort";
const PAGE_QUERY_PARAM = "page";

export type Props = Pick<ProductListingPage, "sortOptions"> & {
  url: string;
};

const BASE_FALLBACK = "http://localhost";

const parseUrl = (href: string | undefined): URL | null => {
  if (!href) return null;
  try {
    return new URL(href, BASE_FALLBACK);
  } catch {
    return null;
  }
};

const getNavTarget = (href: string, value: string) => {
  const url = parseUrl(href);
  if (!url) return null;
  url.searchParams.delete(PAGE_QUERY_PARAM);
  url.searchParams.set(SORT_QUERY_PARAM, value);
  // Pass `to` (pathname) and `search` (object) separately. Strict-typed
  // routes don't parse the `?...` portion of `to`, so packing search into
  // the path string would skip `loaderDeps` and the loader wouldn't re-run.
  return {
    to: url.pathname,
    search: Object.fromEntries(url.searchParams),
  };
};

const labels: Record<string, string> = {
  "relevance:desc": "Relevância",
  "price:desc": "Maior preço",
  "price:asc": "Menor preço",
  "orders:desc": "Mais vendidos",
  "name:desc": "Nome — Z a A",
  "name:asc": "Nome — A a Z",
  "release:desc": "Mais recentes",
  "discount:desc": "Maior desconto",
};

export default function Sort({ sortOptions, url }: Props) {
  const navigate = useNavigate();
  const parsed = parseUrl(url);
  const urlSort = parsed?.searchParams.get(SORT_QUERY_PARAM) ?? "";

  const options =
    sortOptions?.map(({ value, label }) => ({
      target: getNavTarget(url, value),
      value,
      label,
    })) ?? [];

  // Fall back to the first option when the URL has no sort param so the
  // <select> stays a controlled component without React warnings.
  const currentSort = options.some((o) => o.value === urlSort)
    ? urlSort
    : (options[0]?.value ?? "");

  return (
    <>
      <label htmlFor="sort" className="sr-only">
        Ordenar por
      </label>
      <select
        id="sort"
        name="sort"
        className="frost h-9 rounded-sm px-3 text-xs text-ink-soft focus:outline-none"
        value={currentSort}
        onChange={(e) => {
          const next = options.find((o) => o.value === e.currentTarget.value);
          if (next?.target) navigate(next.target);
        }}
      >
        {options.map(({ value, label }) => (
          <option key={value} label={labels[label] ?? label} value={value}>
            {label}
          </option>
        ))}
      </select>
    </>
  );
}
