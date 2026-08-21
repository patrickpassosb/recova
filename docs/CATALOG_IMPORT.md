# Catalog Import

Design for the deterministic importer that builds the ~10,000-product fashion
stress-test catalog. The catalog is Recova's product-quality oracle, not
decorative seed data.

## Source dataset

- **Source**: HuggingFace `Shopify/product-catalogue` (Apache-2.0).
- **Scale**: ~10,000 diverse products with strong apparel representation
  (~2,173 apparel products available). Do not chase fashion purity at the cost
  of diversity — the catalog must remain broad enough to create non-trivial
  ranking decisions across categories.
- **Real data**: existing product images, titles, descriptions, brands, and
  categories come from the dataset. Real image URLs are preserved.

## Pipeline

```
licensed/public product dataset
  → deterministic normalization/import script
  → Recova Catalog schema
  → storefront/search index
```

The importer is a single deterministic script. It is idempotent: re-running it
with the same dataset and seed produces byte-identical output.

## Deterministic generation (fixed seed)

Only **test-only / operational fields** that the source dataset does not
provide are generated deterministically from a fixed seed. The LLM is never the
primary catalog generator.

Generated fields (fixed-seed, deterministic):

- **price** — only when the source product has no price;
- **availability** — stock states for products/variants;
- **variants** — size/color/option combinations where the source supports them;
- **SKUs** — synthetic SKU identifiers;
- **adversarial near-matches** — deliberately difficult fixtures (out-of-stock
  variants, near-matches, missing attributes, ambiguous intent, wrong-category
  distractors, soft-preference-only matches that violate a hard constraint).

The seed is fixed and recorded in the provenance section so results are
reproducible across CI runs and machines.

## Zero LLM product generation

The catalog is created **programmatically**. Gemini/Gemma are never asked to
invent products. LLMs may enrich or classify only where useful (e.g. optional
attribute classification), and any such enrichment is recorded separately from
the deterministic base so it can be audited and reverted.

## Provenance

- **License**: Apache-2.0 (HuggingFace `Shopify/product-catalogue`).
- **Product count**: ~10,000 total; ~2,173 apparel.
- **Image URLs**: real, sourced from the dataset.
- **Generated fields**: price (when missing), availability, variants, SKUs,
  adversarial near-matches — all fixed-seed deterministic.
- **Seed**: recorded here and in the import script; changing it is a breaking
  change to the benchmark oracle.
- **LLM-generated content**: none for product identity; optional enrichment is
  tracked separately.

## Storefront integration

The 10k catalog is visible in the actual Recova demo storefront via a
**Recova stress-test catalog adapter** implementing the stable `CatalogAdapter`
interface. The storefront depends on stable interfaces, not Shopify directly.
The 10,000 products are not required to exist inside Shopify; any Shopify
integration is a separate adapter path, not the system of record for the 10k
catalog.
