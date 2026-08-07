import { createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { DecoRootLayout } from "@decocms/tanstack";
import { CART_QUERY_KEY, getCartServerFn } from "../platform/cart";
import { getUserServerFn, USER_QUERY_KEY } from "../platform/user";
import MinicartDrawer from "../components/minicart/MinicartDrawer";
// @ts-ignore Vite ?url import
import appCss from "../styles/app.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ context }) => {
    const tasks: Promise<unknown>[] = [];
    if (!context.queryClient.getQueryData(CART_QUERY_KEY)) {
      tasks.push(
        getCartServerFn()
          .then((cart) => context.queryClient.setQueryData(CART_QUERY_KEY, cart))
          .catch(() => {}),
      );
    }
    if (!context.queryClient.getQueryData(USER_QUERY_KEY)) {
      tasks.push(
        getUserServerFn()
          .then((user) => context.queryClient.setQueryData(USER_QUERY_KEY, user))
          .catch(() => {}),
      );
    }
    await Promise.all(tasks);
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Storefront-tanstack" },
      {
        name: "description",
        content:
          "Shop the new season at Storefront-tanstack — apparel, accessories and more, with up to 60% off.",
      },
      // Open Graph / Twitter defaults so shared links render a preview card.
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Storefront-tanstack" },
      { property: "og:title", content: "Storefront-tanstack" },
      {
        property: "og:description",
        content:
          "Shop the new season at Storefront-tanstack — apparel, accessories and more, with up to 60% off.",
      },
      {
        property: "og:image",
        content:
          "https://decoims.com/demo-storefront/2026/07/57440993-8c68-4943-9084-1c947c1d0fd5-banner1.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://api.fontshare.com" },
      {
        rel: "stylesheet",
        href: "https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  component: RootLayout,
});

function RootLayout() {
  return (
    <DecoRootLayout lang="en" siteName="demo-storefront">
      <MinicartDrawer />
    </DecoRootLayout>
  );
}
