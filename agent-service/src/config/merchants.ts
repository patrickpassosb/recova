import type { CatalogAdapter, CommerceAdapter } from "../adapters/interfaces.js";
import { StressTestCatalogAdapter } from "../adapters/stress-test-catalog.js";
import {
  MerchantConfigSchema,
  type MerchantConfig,
} from "../domain/schemas.js";

/**
 * Server-controlled merchant registry (docs/PLAN_FINAL.md §3.8).
 *
 * Merchant configuration is provisioned server-side and never selected by
 * client input. This in-code registry maps a `storeId` to a validated
 * `MerchantConfig` plus the adapter instances that back it:
 *
 *   - `demo`          — the stress-test catalog adapter (active).
 *   - `demo-shopify`  — the Shopify adapter *shape*, deactivated because no
 *     credentials are provisioned (the adapter is never constructed).
 *
 * Unknown `storeId` resolves to `null` (the HTTP layer returns 404, with no
 * fallback to a default merchant).
 */

export type AdapterType = "stress-test" | "shopify";

/** A resolved merchant: validated config plus its live adapter instances. */
export interface MerchantRuntime {
  config: MerchantConfig;
  catalogAdapter: CatalogAdapter;
  commerceAdapter: CommerceAdapter;
  /** `false` when the merchant is registered but not provisioned/active. */
  active: boolean;
}

const ALL_STRATEGIES: MerchantConfig["enabledStrategies"] = [
  "EXACT_ALTERNATIVE",
  "VARIANT_RECOVERY",
  "SOFT_PREFERENCE_RELAXATION",
  "QUERY_REPAIR",
  "BUNDLE_RECOVERY",
  "NO_VALID_RECOVERY",
];

function baseConfig(
  storeId: string,
  adapter: AdapterType,
): MerchantConfig {
  return MerchantConfigSchema.parse({
    storeId,
    catalogAdapter: adapter,
    commerceAdapter: adapter,
    branding: {},
    enabledStrategies: ALL_STRATEGIES,
    repairPermissions: {},
    modelLimits: {},
    attribution: {},
    featureFlags: {},
  });
}

/** The single active demo merchant, backed by the stress-test catalog. */
const demoAdapter = new StressTestCatalogAdapter();

const REGISTRY: Record<string, MerchantRuntime> = {
  demo: {
    config: baseConfig("demo", "stress-test"),
    catalogAdapter: demoAdapter,
    commerceAdapter: demoAdapter,
    active: true,
  },
  // Deactivated: the Shopify adapter requires credentials that are not
  // provisioned, so no adapter instance is constructed.
  "demo-shopify": {
    config: baseConfig("demo-shopify", "shopify"),
    catalogAdapter: null as unknown as CatalogAdapter,
    commerceAdapter: null as unknown as CommerceAdapter,
    active: false,
  },
};

/**
 * Resolve a merchant by `storeId`. Returns `null` for unknown store IDs (the
 * caller must return 404 — there is no fallback merchant).
 */
export function getMerchant(storeId: string): MerchantRuntime | null {
  return REGISTRY[storeId] ?? null;
}

/** Whether a store ID is registered (active or deactivated). */
export function isKnownStore(storeId: string): boolean {
  return storeId in REGISTRY;
}
