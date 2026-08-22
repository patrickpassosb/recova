# ROADMAP

Deferred options and follow-ups, in priority order.

## Option C — stress-test catalog explorer + demo cart UI (deferred)

The `demo` merchant is bound to the real Shopify demo catalog (Option A,
done): cards carry real Shopify variant GIDs, so Add to cart and Buy now hit
the real Storefront API and yield real `*.myshopify.com` cart/checkout URLs.

Deferred: a 10k stress-test catalog explorer with a self-contained demo cart
UI (no Shopify dependency), useful for offline/dev and for exercising the
stress catalog's scale. The `demo-stress` merchant already exposes the stress
catalog for search; Option C would add the explorer and cart surfaces.

## W18 demo verification checklist — amendment

Day-3 gate gap found during the Option A fix: rendering was verified but the
button click was not, so commerce failed silently (synthetic variant IDs
rejected by Shopify). Add to the W18 checklist:

- [ ] Click-through E2E: from a zero-results query, click **Add to cart**
      (cart badge increments via a real Shopify mutation) and **Buy now**
      (lands on a real `*.myshopify.com/checkouts/…` URL).
- [ ] Confirm the agent runs with `STUB_GEMINI=false` for the demo, and log
      which merchant backing is active at startup.
