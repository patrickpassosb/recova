import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CatalogProductSchema,
  CATALOG_SEED,
  TARGET_PRODUCT_COUNT,
  DEV_FIXTURE_COUNT,
  APPAREL_CATEGORY,
  topLevelCategory,
  generateCatalog,
  selectDevFixture,
  mulberry32,
  type SourceRow,
  type CatalogProduct,
} from "../src/catalog/schema.js";

/**
 * Deterministic catalog importer (W06).
 *
 * Downloads the HuggingFace `Shopify/product-catalogue` dataset (Apache-2.0)
 * via the public datasets-server HTTP endpoints (no auth), normalizes each row
 * into the Recova `CatalogProduct` schema, and writes:
 *
 *   - `catalog/data/catalog.jsonl`  — the full ~10,000-product catalog
 *     (gitignored, reproducible by re-running this script);
 *   - `catalog/fixtures/catalog.dev.jsonl` — a deterministic ~500-product dev
 *     fixture (committed) selected with an apparel quota plus round-robin
 *     samples from the other top-level categories (see `selectDevFixture`).
 *
 * The import path is fully deterministic: a fixed seed (`CATALOG_SEED`) drives
 * a `mulberry32` PRNG (see `src/catalog/schema.ts`). No wall-clock time,
 * `Math.random`, or other nondeterministic source is used anywhere in
 * selection or generation. Image URLs are stripped of their expiring
 * `Expires`/`Signature` query values (see `stableImageUrl`), so re-running
 * with the same dataset produces byte-identical output.
 *
 * Only test-only / operational fields that the dataset does not provide are
 * generated: price (the dataset has no price), availability (~8% out-of-stock
 * variants), apparel size-run variants (2-6 per product), SKUs, and ~150
 * adversarial fixtures (near-titles and cross-category echo titles). Real
 * titles, descriptions, brands, categories, and image URLs come from the
 * dataset only.
 */

const DATASET = "Shopify/product-catalogue";
const INFO_ENDPOINT = "https://datasets-server.huggingface.co/info";
const ROWS_ENDPOINT = "https://datasets-server.huggingface.co/rows";
const PAGE_SIZE = 100;
const MAX_ATTEMPTS = 10;
const REQUEST_DELAY_MS = 200;
const CONCURRENCY = 2;
const REQUEST_TIMEOUT_MS = 60_000;
const RATE_LIMIT_WAIT_MS = 60_000;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dataDir = resolve(repoRoot, "catalog/data");
const fixturesDir = resolve(repoRoot, "catalog/fixtures");

// ============================================================================
// Network fetch (datasets-server, public, no auth)
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string, attempts = MAX_ATTEMPTS): Promise<unknown> {
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? 0);
        const waitMs =
          retryAfter > 0 ? retryAfter * 1000 : RATE_LIMIT_WAIT_MS;
        console.error(`  rate limited (429), waiting ${waitMs}ms`);
        await sleep(waitMs);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.json();
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  fetch attempt ${i + 1}/${attempts} failed: ${msg}`);
      await sleep(1000 * (i + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to fetch ${url} after ${attempts} attempts`);
}

interface RawRow {
  row_idx: number;
  row: {
    product_title?: string | null;
    product_description?: string | null;
    product_image?: { src?: string | null } | null;
    ground_truth_brand?: string | null;
    ground_truth_category?: string | null;
  };
}

/**
 * Strip the expiring query string from a datasets-server `cached-assets` URL.
 *
 * The server signs image URLs with `Expires` / `Signature` / `Key-Pair-Id`
 * query values that change on every fetch (~1 hour expiry). Keeping them would
 * make re-imports produce different bytes for identical source data and seed,
 * breaking the byte-identical/idempotent output contract. The stable
 * content-hash path (up to `image.jpg`) identifies the image independently of
 * the signature, so only that prefix is preserved.
 */
function stableImageUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  const q = src.indexOf("?");
  return q >= 0 ? src.slice(0, q) : src;
}

function normalizeRow(split: "train" | "test", raw: RawRow): SourceRow {
  const r = raw.row;
  const categoryPath = (r.ground_truth_category ?? "")
    .split(" > ")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    split,
    rowIndex: raw.row_idx,
    title: r.product_title ?? "",
    description: r.product_description ?? "",
    brand: r.ground_truth_brand ?? "",
    categoryPath,
    imageUrl: stableImageUrl(r.product_image?.src),
  };
}

async function getSplitSizes(): Promise<{ train: number; test: number }> {
  const info = (await fetchJson(
    `${INFO_ENDPOINT}?dataset=${DATASET}`,
  )) as {
    dataset_info: { default: { splits: Record<string, { num_examples: number }> } };
  };
  const splits = info.dataset_info.default.splits;
  return {
    train: splits.train?.num_examples ?? 0,
    test: splits.test?.num_examples ?? 0,
  };
}

async function fetchRows(split: "train" | "test", total: number): Promise<SourceRow[]> {
  const partialPath = resolve(dataDir, `.partial-${split}.jsonl`);
  let rows: SourceRow[] = [];
  if (existsSync(partialPath)) {
    rows = readFileSync(partialPath, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as SourceRow);
    console.error(`  ${split}: resumed ${rows.length}/${total} rows from partial`);
  }

  const offsets: number[] = [];
  for (let offset = rows.length; offset < total; offset += PAGE_SIZE) offsets.push(offset);

  for (let i = 0; i < offsets.length; i += CONCURRENCY) {
    const batch = offsets.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (offset) => {
        const url = `${ROWS_ENDPOINT}?dataset=${DATASET}&config=default&split=${split}&offset=${offset}&length=${PAGE_SIZE}`;
        const data = (await fetchJson(url)) as { rows: RawRow[] };
        return data.rows.map((raw) => normalizeRow(split, raw));
      }),
    );
    for (const r of results) rows.push(...r);
    // Persist progress so an interrupted run can resume.
    writeFileSync(
      partialPath,
      rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
    );
    if (i % (CONCURRENCY * 10) === 0) {
      console.error(`  ${split}: fetched ${rows.length}/${total}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }
  return rows;
}

// ============================================================================
// Main
// ============================================================================

function categoryHistogram(products: CatalogProduct[]): Map<string, number> {
  const hist = new Map<string, number>();
  for (const p of products) {
    const cat = topLevelCategory(p.categoryPath);
    hist.set(cat, (hist.get(cat) ?? 0) + 1);
  }
  return hist;
}

function formatHistogram(hist: Map<string, number>, top = 10): string {
  return [...hist.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([cat, n]) => `${cat}: ${n}`)
    .join("\n");
}

async function main(): Promise<void> {
  mkdirSync(dataDir, { recursive: true });
  const { train, test } = await getSplitSizes();
  console.log(`dataset splits: train=${train} test=${test}`);

  const trainRows = await fetchRows("train", train);
  const testRows = await fetchRows("test", test);
  const allRows = [...trainRows, ...testRows];
  console.log(`fetched ${allRows.length} rows`);

  const products = generateCatalog(allRows, TARGET_PRODUCT_COUNT, CATALOG_SEED);
  const apparelCount = products.filter(
    (p) => topLevelCategory(p.categoryPath) === APPAREL_CATEGORY,
  ).length;
  const adversarialCount = products.filter((p) => p._provenance.adversarial).length;
  const variantCount = products.reduce((n, p) => n + p.variants.length, 0);
  const outOfStock = products.reduce(
    (n, p) => n + p.variants.filter((v) => !v.available).length,
    0,
  );

  // Validate every product against the schema before writing.
  for (const p of products) CatalogProductSchema.parse(p);

  mkdirSync(dataDir, { recursive: true });
  mkdirSync(fixturesDir, { recursive: true });

  const fullPath = resolve(dataDir, "catalog.jsonl");
  writeFileSync(
    fullPath,
    products.map((p) => JSON.stringify(p)).join("\n") + "\n",
  );

  const devFixture = selectDevFixture(
    products,
    DEV_FIXTURE_COUNT,
    mulberry32(CATALOG_SEED),
  );
  const fixturePath = resolve(fixturesDir, "catalog.dev.jsonl");
  writeFileSync(
    fixturePath,
    devFixture.map((p) => JSON.stringify(p)).join("\n") + "\n",
  );

  console.log(`wrote ${products.length} products to ${fullPath}`);
  console.log(`wrote ${devFixture.length} products to ${fixturePath}`);
  console.log(`apparel: ${apparelCount}`);
  console.log(`adversarial: ${adversarialCount}`);
  console.log(`variants: ${variantCount} (out-of-stock: ${outOfStock})`);
  console.log("dev fixture category histogram (top 10):");
  console.log(formatHistogram(categoryHistogram(devFixture)));
}

const isMain =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
