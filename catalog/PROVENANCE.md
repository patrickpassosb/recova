# Catalog Provenance

Provenance and generation rules for the Recova stress-test catalog (W06).

## Source dataset

- **Dataset**: HuggingFace [`Shopify/product-catalogue`](https://huggingface.co/datasets/Shopify/product-catalogue)
- **License**: Apache-2.0
- **Splits**: `train` (38,631 rows) + `test` (9,658 rows) = 48,289 rows
- **Download**: public datasets-server HTTP endpoints (no auth), via
  `https://datasets-server.huggingface.co/rows` (paginated, 100 rows/request).
  The importer (`agent-service/scripts/import-catalog.ts`) fetches rows,
  normalizes them, and writes the catalog. It is idempotent: re-running with
  the same dataset and seed produces byte-identical output.

### Fields sourced from the dataset (real, not generated)

| Catalog field | Dataset field |
|---------------|---------------|
| `title` | `product_title` |
| `description` | `product_description` |
| `brand` | `ground_truth_brand` |
| `categoryPath` | `ground_truth_category` split on `" > "` |
| `imageUrls` | `product_image.src` (real dataset image URL) |

> **Image URL note**: the dataset stores images as bytes; the datasets-server
> serves them as signed `cached-assets` URLs that expire (~1 hour). The
> importer strips the expiring `Expires` / `Signature` / `Key-Pair-Id` query
> values and preserves only the stable content-hash path (up to `image.jpg`),
> which identifies the image independently of the signature. This keeps
> re-imports byte-identical for identical source data and seed.

## Deterministic generation (fixed seed)

Only test-only / operational fields that the dataset does not provide are
generated, deterministically, from a fixed seed. The LLM is never the catalog
generator.

- **Seed**: `20260821` (`CATALOG_SEED` in `agent-service/src/catalog/schema.ts`).
  Changing the seed is a breaking change to the benchmark oracle.
- **PRNG**: `mulberry32`. No wall-clock time, `Math.random`, or other
  nondeterministic source is used anywhere in selection or generation.

### Generated fields

| Field | Rule |
|-------|------|
| `price` | The dataset has no price, so every product's price is generated from a per-top-level-category USD range (e.g. Apparel & Accessories $15–$300), rounded to cents. |
| `currency` | `"USD"` for all products. |
| `variants` | Apparel products get a 2–6 size run (`XS`–`XXL`); non-apparel products get a single variant. |
| `sku` | Synthetic `SKU-{SPLIT}-{rowIndex}-{variantIndex}` identifiers. |
| `availability` | ~8% of variants are deliberately out-of-stock (`available: false`). |
| `productId` / `variantId` | `p_{split}_{rowIndex}` / `p_{split}_{rowIndex}_v{n}` (traceable to the source row). |

### Adversarial fixtures

~150 products are marked adversarial (`_provenance.adversarial: true`) and
their titles are deterministically mutated into one of two kinds:

- **`near-title`** — a distinguishing suffix is appended (e.g.
  `"Floral Midi Dress"` → `"Floral Midi Dress Pro"`), creating a near-match to
  the original title.
- **`cross-category-echo`** — a category-echo word is prepended (e.g.
  `"Water Bottle"` → `"Running Water Bottle"`), creating a cross-category
  distractor.

The adversarial kind is recorded in `_provenance.adversarialKind`, and
`_provenance.generated.title` is `true` for these products.

## Selection

`selectRows` (in `agent-service/src/catalog/schema.ts`) deterministically
selects ~10,000 products:

1. All `Apparel & Accessories` rows are kept (strong apparel representation).
2. The remaining slots are filled round-robin across the other top-level
   categories (each category's rows are first shuffled deterministically) so
   the catalog stays broad enough for non-trivial ranking decisions.

## Outputs

- `catalog/data/catalog.jsonl` — full catalog (gitignored, reproducible via the
  importer).
- `catalog/fixtures/catalog.dev.jsonl` — deterministic ~500-product dev
  fixture (committed). Unlike the full catalog (which keeps all apparel
  first), the dev fixture is selected with a bounded apparel quota plus
  round-robin samples from the other top-level categories (see
  `selectDevFixture` in `agent-service/src/catalog/schema.ts`), so it
  exercises ranking across real product categories and cross-category
  distractors. Adversarial products are retained.

## Provenance tracking

Every product carries a `_provenance` object recording:

- `source` / `sourceSplit` / `sourceRowIndex` — the dataset row it came from;
- `generated` — which fields were synthesized (`price`, `availability`,
  `variants`, `sku`, `title`);
- `adversarial` / `adversarialKind` — whether it is an adversarial fixture and
  of which kind;
- `seed` — the fixed generation seed.

## LLM-generated content

None for product identity. The catalog is created programmatically; any future
LLM enrichment is tracked separately from this deterministic base so it can be
audited and reverted.
