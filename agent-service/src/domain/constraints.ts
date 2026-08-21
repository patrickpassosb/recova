import type { ConstraintKind, ShopperConstraint } from "./schemas.js";

/**
 * Deterministic constraint extraction (no LLM).
 *
 * `extractConstraints(query)` turns a raw English shopper query into a list of
 * `ShopperConstraint`s using only lexical rules and the data tables below. It
 * is the authority over *what the shopper asked for*; the solver (solver.ts)
 * is the authority over *whether catalog candidates satisfy it*.
 *
 * Extraction covers:
 *   - price_max   ("under $120", "up to 300", "up to R$300", numeric ranges)
 *   - size        (US/EU numerics + letters + "one size")
 *   - color       (named colors, synonym-normalized)
 *   - category    (synonym-normalized from a common ecommerce taxonomy)
 *   - compatibility ("compatible with X", "for iPhone")
 *   - intended_use ("for running", "for weddings")
 *
 * Hardness defaults (see DEFAULT_HARDNESS): price_max/size/compatibility are
 * hard; color/intended_use are soft unless the query is phrased with
 * "must"/"only". Category is hard (it is the most fundamental signal).
 */

// ============================================================================
// DATA TABLES (data, not code)
//
// These tables are declarative data. They are intentionally kept separate from
// the extraction logic so they can be reviewed/edited as data. Each maps a
// surface form (as it appears in a query) to a canonical value.
// ============================================================================

/**
 * Color synonyms → canonical color. Keys are the surface forms recognized in a
 * query (including common variants); values are the canonical color used in
 * catalog attributes and constraint values.
 */
export const COLOR_SYNONYMS: Record<string, string> = {
  // canonical colors
  black: "black",
  white: "white",
  red: "red",
  blue: "blue",
  green: "green",
  yellow: "yellow",
  orange: "orange",
  purple: "purple",
  pink: "pink",
  brown: "brown",
  gray: "gray",
  beige: "beige",
  navy: "navy",
  teal: "teal",
  maroon: "maroon",
  gold: "gold",
  silver: "gray",
  tan: "beige",
  cream: "white",
  ivory: "white",
  // grey spelling
  grey: "gray",
  // blue family
  "navy blue": "navy",
  "royal blue": "blue",
  "light blue": "blue",
  "dark blue": "blue",
  "sky blue": "blue",
  "baby blue": "blue",
  "powder blue": "blue",
  denim: "blue",
  indigo: "blue",
  // green family
  "dark green": "green",
  "light green": "green",
  olive: "green",
  emerald: "green",
  forest: "green",
  sage: "green",
  mint: "green",
  // red family
  crimson: "red",
  scarlet: "red",
  burgundy: "maroon",
  wine: "maroon",
  // pink family
  "light pink": "pink",
  "hot pink": "pink",
  blush: "pink",
  magenta: "pink",
  fuchsia: "pink",
  // purple family
  violet: "purple",
  lavender: "purple",
  lilac: "purple",
  // orange family
  coral: "orange",
  peach: "orange",
  amber: "orange",
  rust: "orange",
  terracotta: "orange",
  // yellow family
  mustard: "yellow",
  lemon: "yellow",
  // teal family
  turquoise: "teal",
  aqua: "teal",
  cyan: "teal",
  // brown family
  chocolate: "brown",
  bronze: "brown",
  copper: "brown",
  camel: "brown",
  taupe: "brown",
  // neutral family
  khaki: "beige",
  nude: "beige",
  "off-white": "white",
  charcoal: "gray",
  graphite: "gray",
  slate: "gray",
  ash: "gray",
  smoke: "gray",
  steel: "gray",
  gunmetal: "gray",
};

/**
 * Category synonyms → canonical category. Seeded from a common ecommerce
 * taxonomy (Apparel and Accessories, Electronics, Home and Garden). Keys are
 * surface forms (including plurals and common aliases); values are canonical
 * leaf categories used in catalog attributes and constraint values.
 */
export const CATEGORY_SYNONYMS: Record<string, string> = {
  // Apparel and Accessories
  dress: "dress",
  dresses: "dress",
  gown: "dress",
  gowns: "dress",
  frock: "dress",
  shirt: "shirt",
  shirts: "shirt",
  blouse: "shirt",
  blouses: "shirt",
  top: "shirt",
  tops: "shirt",
  "t-shirt": "t-shirt",
  "t shirt": "t-shirt",
  tshirt: "t-shirt",
  tee: "t-shirt",
  tees: "t-shirt",
  pants: "pants",
  trousers: "pants",
  slacks: "pants",
  jeans: "pants",
  denim: "pants",
  skirt: "skirt",
  skirts: "skirt",
  jacket: "jacket",
  jackets: "jacket",
  coat: "jacket",
  coats: "jacket",
  blazer: "jacket",
  blazers: "jacket",
  sweater: "sweater",
  sweaters: "sweater",
  jumper: "sweater",
  jumpers: "sweater",
  pullover: "sweater",
  cardigan: "sweater",
  hoodie: "hoodie",
  hoodies: "hoodie",
  sweatshirt: "hoodie",
  sweatshirts: "hoodie",
  shoes: "shoes",
  shoe: "shoes",
  sneakers: "shoes",
  sneaker: "shoes",
  trainers: "shoes",
  trainer: "shoes",
  boots: "shoes",
  boot: "shoes",
  sandals: "shoes",
  sandal: "shoes",
  heels: "shoes",
  flats: "shoes",
  loafers: "shoes",
  "running shoes": "shoes",
  hat: "hat",
  hats: "hat",
  cap: "hat",
  caps: "hat",
  beanie: "hat",
  bag: "bag",
  bags: "bag",
  handbag: "bag",
  handbags: "bag",
  purse: "bag",
  purses: "bag",
  backpack: "bag",
  backpacks: "bag",
  tote: "bag",
  belt: "belt",
  belts: "belt",
  scarf: "scarf",
  scarves: "scarf",
  socks: "socks",
  sock: "socks",
  swimsuit: "swimsuit",
  swimwear: "swimsuit",
  bikini: "swimsuit",
  shorts: "shorts",
  suit: "suit",
  suits: "suit",
  // Electronics
  phone: "phone",
  phones: "phone",
  smartphone: "phone",
  smartphones: "phone",
  cellphone: "phone",
  "cell phone": "phone",
  mobile: "phone",
  mobiles: "phone",
  iphone: "phone",
  laptop: "laptop",
  laptops: "laptop",
  notebook: "laptop",
  notebooks: "laptop",
  computer: "laptop",
  computers: "laptop",
  tablet: "tablet",
  tablets: "tablet",
  ipad: "tablet",
  headphones: "headphones",
  headphone: "headphones",
  earbuds: "headphones",
  earbud: "headphones",
  earphones: "headphones",
  earphone: "headphones",
  headset: "headphones",
  camera: "camera",
  cameras: "camera",
  tv: "tv",
  television: "tv",
  televisions: "tv",
  telly: "tv",
  watch: "watch",
  watches: "watch",
  smartwatch: "watch",
  smartwatches: "watch",
  speaker: "speaker",
  speakers: "speaker",
  charger: "charger",
  chargers: "charger",
  // Home and Garden
  sofa: "sofa",
  sofas: "sofa",
  couch: "sofa",
  couches: "sofa",
  loveseat: "sofa",
  chair: "chair",
  chairs: "chair",
  armchair: "chair",
  armchairs: "chair",
  table: "table",
  tables: "table",
  desk: "table",
  desks: "table",
  lamp: "lamp",
  lamps: "lamp",
  bed: "bed",
  beds: "bed",
  mattress: "bed",
  mattresses: "bed",
  rug: "rug",
  rugs: "rug",
  carpet: "rug",
  carpets: "rug",
  curtain: "curtain",
  curtains: "curtain",
  drapes: "curtain",
  pillow: "pillow",
  pillows: "pillow",
  cushion: "pillow",
  cushions: "pillow",
  blanket: "blanket",
  blankets: "blanket",
  throw: "blanket",
  plant: "plant",
  plants: "plant",
  grill: "grill",
  grills: "grill",
  barbecue: "grill",
  bbq: "grill",
  vacuum: "vacuum",
  vacuums: "vacuum",
};

/**
 * Intended-use synonyms → canonical use. Keys are surface forms; values are
 * canonical intended-use values used in catalog attributes and constraints.
 */
export const USE_SYNONYMS: Record<string, string> = {
  running: "running",
  run: "running",
  jogging: "running",
  gym: "gym",
  workout: "gym",
  exercise: "gym",
  fitness: "gym",
  wedding: "wedding",
  weddings: "wedding",
  formal: "formal",
  "formal event": "formal",
  "formal events": "formal",
  hiking: "hiking",
  hike: "hiking",
  outdoor: "outdoor",
  outdoors: "outdoor",
  work: "work",
  office: "work",
  business: "work",
  casual: "casual",
  everyday: "casual",
  party: "party",
  parties: "party",
  "night out": "party",
  beach: "beach",
  swimming: "swimming",
  swim: "swimming",
  winter: "winter",
  summer: "summer",
  travel: "travel",
  traveling: "travel",
  yoga: "yoga",
  dance: "dance",
  dancing: "dance",
};

/**
 * Device/brand targets recognized for compatibility ("for iPhone",
 * "compatible with Samsung"). The first word of a "for X" target is checked
 * against this list to decide compatibility vs intended use.
 */
export const COMPATIBILITY_TARGETS: readonly string[] = [
  "iphone",
  "ipad",
  "ipod",
  "macbook",
  "mac",
  "imac",
  "samsung",
  "galaxy",
  "pixel",
  "android",
  "ios",
  "nintendo",
  "switch",
  "playstation",
  "ps5",
  "ps4",
  "xbox",
  "kindle",
  "airpods",
  "windows",
  "chromebook",
  "gopro",
  "fitbit",
  "garmin",
  "sony",
  "bose",
  "jbl",
];

/**
 * Default hardness per constraint kind. price_max/size/compatibility are hard;
 * color/intended_use are soft (upgraded to hard when phrased "must"/"only").
 * Category is hard.
 */
export const DEFAULT_HARDNESS: Record<ConstraintKind, "hard" | "soft"> = {
  category: "hard",
  price_max: "hard",
  size: "hard",
  color: "soft",
  compatibility: "hard",
  intended_use: "soft",
};

// ============================================================================
// Normalization module
// ============================================================================

/** Strip combining diacritics (é → e, ç → c, …). */
export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Basic English plural stripping (parties → party, dresses → dress, shoes → shoe). */
export function stripPlural(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("es") && word.length > 3) {
    const stem = word.slice(0, -2);
    // Remove "es" only when the stem ends in s/x/z/ch/sh (dresses → dress,
    // boxes → box). Otherwise the "e" is part of the stem (shoes → shoe).
    if (/[sxz]$/.test(stem) || /(ch|sh)$/.test(stem)) return stem;
    return word.slice(0, -1);
  }
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) {
    return word.slice(0, -1);
  }
  return word;
}

/** Lowercase + accent-strip + whitespace collapse. */
export function normalize(text: string): string {
  return stripAccents(text.toLowerCase()).replace(/\s+/g, " ").trim();
}

/** Canonicalize a single word through a synonym table (with plural fallback). */
export function normalizeSynonym(
  word: string,
  table: Record<string, string>,
): string {
  const w = stripAccents(word.toLowerCase());
  if (w in table) return table[w];
  const singular = stripPlural(w);
  if (singular in table) return table[singular];
  return w;
}

// ============================================================================
// Extraction helpers
// ============================================================================

const STOP_WORDS = new Set([
  "and",
  "or",
  "for",
  "that",
  "which",
  "with",
  "the",
  "a",
  "an",
  "to",
  "in",
  "on",
  "at",
  "of",
]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a word-boundary alternation regex from phrases (longest first). */
function buildPhraseRegex(phrases: string[]): RegExp {
  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(?:${sorted.map(escapeRegex).join("|")})\\b`, "g");
}

function cleanTarget(target: string): string {
  const words = target.split(/\s+/);
  while (words.length && STOP_WORDS.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

function isCompatibilityTarget(target: string): boolean {
  const first = target.split(/\s+/)[0];
  return (
    COMPATIBILITY_TARGETS.includes(first) ||
    COMPATIBILITY_TARGETS.includes(target)
  );
}

function isUseTarget(target: string): boolean {
  const first = target.split(/\s+/)[0];
  return target in USE_SYNONYMS || first in USE_SYNONYMS;
}

function isExcluded(
  start: number,
  length: number,
  spans: Array<[number, number]>,
): boolean {
  const end = start + length;
  return spans.some(([s, e]) => start < e && s < end);
}

function normalizeSizeValue(v: string): string {
  return /^[a-z]+$/.test(v) ? v.toUpperCase() : v;
}

/**
 * Detect when a color word is part of a proper noun (brand/title) rather than
 * a color request. A color word immediately followed by a capitalized word
 * (e.g. "Orange Crush", "Red Bull") is treated as a named entity, not a color.
 */
function isBrandName(raw: string, colorWord: string): boolean {
  const re = new RegExp(
    `\\b(${escapeRegex(colorWord)})\\s+([A-Za-z][a-zA-Z]*)\\b`,
    "gi",
  );
  let m: RegExpMatchArray | null;
  while ((m = re.exec(raw)) !== null) {
    const following = m[2];
    if (following[0] === following[0].toUpperCase()) return true;
  }
  return false;
}

// ============================================================================
// Per-kind extractors
// ============================================================================

function extractPrice(normalized: string): ShopperConstraint[] {
  const out: ShopperConstraint[] = [];
  const seen = new Set<number>();
  const currency = String.raw`(?:r\$|\$|us\$|€|£)?`;
  const num = String.raw`(\d+(?:\.\d+)?)`;

  const patterns: Array<{ re: RegExp; pick: (m: RegExpMatchArray) => number }> =
    [
      // numeric ranges → take the upper bound as the ceiling
      {
        re: new RegExp(
          String.raw`between\s+${currency}\s*${num}\s*(?:and|-|to)\s*${currency}\s*${num}`,
          "g",
        ),
        pick: (m) => Number(m[2]),
      },
      {
        re: new RegExp(
          String.raw`${currency}\s*${num}\s*(?:-|to)\s*${currency}\s*${num}`,
          "g",
        ),
        pick: (m) => Number(m[2]),
      },
      // explicit ceilings
      {
        re: new RegExp(String.raw`under\s+${currency}\s*${num}`, "g"),
        pick: (m) => Number(m[1]),
      },
      {
        re: new RegExp(String.raw`up\s+to\s+${currency}\s*${num}`, "g"),
        pick: (m) => Number(m[1]),
      },
      {
        re: new RegExp(String.raw`less\s+than\s+${currency}\s*${num}`, "g"),
        pick: (m) => Number(m[1]),
      },
      {
        re: new RegExp(String.raw`below\s+${currency}\s*${num}`, "g"),
        pick: (m) => Number(m[1]),
      },
      {
        re: new RegExp(
          String.raw`(?:max|maximum|at\s+most)\s+${currency}\s*${num}`,
          "g",
        ),
        pick: (m) => Number(m[1]),
      },
      {
        re: new RegExp(
          String.raw`${currency}\s*${num}\s*(?:or\s+less|or\s+under|max)`,
          "g",
        ),
        pick: (m) => Number(m[1]),
      },
    ];

  for (const { re, pick } of patterns) {
    let m: RegExpMatchArray | null;
    while ((m = re.exec(normalized)) !== null) {
      const value = pick(m);
      if (!seen.has(value)) {
        seen.add(value);
        out.push({
          kind: "price_max",
          value,
          hardness: "hard",
          sourceText: m[0].trim(),
        });
      }
    }
  }
  return out;
}

function extractSize(raw: string, normalized: string): ShopperConstraint[] {
  const out: ShopperConstraint[] = [];
  const seen = new Set<string>();

  const push = (value: string, sourceText: string) => {
    if (!seen.has(value)) {
      seen.add(value);
      out.push({ kind: "size", value, hardness: "hard", sourceText });
    }
  };

  // "size X" (numeric or letter), but not the "size" inside "one size".
  const sizeRe = /(?<!one[\s-])\bsize\s+([0-9]+(?:\.[0-9]+)?|[a-z]{1,3})\b/g;
  let m: RegExpMatchArray | null;
  while ((m = sizeRe.exec(normalized)) !== null) {
    push(normalizeSizeValue(m[1]), `size ${m[1]}`);
  }

  // "US/EU/UK X" or "US/EU/UK size X"
  const regionRe = /\b(us|eu|uk)\s+(?:size\s+)?([0-9]+(?:\.[0-9]+)?|[a-z]{1,3})\b/g;
  while ((m = regionRe.exec(normalized)) !== null) {
    push(normalizeSizeValue(m[2]), `${m[1]} ${m[2]}`);
  }

  // "one size" / "one-size-fits-all"
  if (/one[\s-]?size(?:\s+fits\s+all)?/.test(normalized)) {
    push("one size", "one size");
  }

  // standalone uppercase size letters (case-sensitive on the raw query)
  const letterRe = /\b(XS|S|M|L|XL|XXL|XXXL)\b/g;
  while ((m = letterRe.exec(raw)) !== null) {
    push(m[1], m[1]);
  }

  return out;
}

function extractColor(
  raw: string,
  normalized: string,
  supportedColors?: ReadonlySet<string>,
): ShopperConstraint[] {
  const out: ShopperConstraint[] = [];
  const seen = new Set<string>();
  const re = buildPhraseRegex(Object.keys(COLOR_SYNONYMS));
  let m: RegExpMatchArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const canonical = COLOR_SYNONYMS[m[0]];
    if (supportedColors && !supportedColors.has(canonical)) continue;
    if (isBrandName(raw, m[0])) continue;
    if (!seen.has(canonical)) {
      seen.add(canonical);
      out.push({ kind: "color", value: canonical, hardness: "soft", sourceText: m[0] });
    }
  }
  return out;
}

function extractCategory(
  normalized: string,
  excludedSpans: Array<[number, number]>,
): ShopperConstraint[] {
  const out: ShopperConstraint[] = [];
  const seen = new Set<string>();
  const re = buildPhraseRegex(Object.keys(CATEGORY_SYNONYMS));
  let m: RegExpMatchArray | null;
  while ((m = re.exec(normalized)) !== null) {
    if (isExcluded(m.index!, m[0].length, excludedSpans)) continue;
    const canonical = CATEGORY_SYNONYMS[m[0]];
    if (!seen.has(canonical)) {
      seen.add(canonical);
      out.push({ kind: "category", value: canonical, hardness: "hard", sourceText: m[0] });
    }
  }
  return out;
}

function extractForAndCompatibility(normalized: string): {
  compatibility: ShopperConstraint[];
  intendedUse: ShopperConstraint[];
  excludedSpans: Array<[number, number]>;
} {
  const compatibility: ShopperConstraint[] = [];
  const intendedUse: ShopperConstraint[] = [];
  const excludedSpans: Array<[number, number]> = [];

  // "compatible with X"
  const compatRe = /compatible\s+with\s+([a-z0-9]+(?:\s+[a-z0-9]+){0,2})/;
  const cm = normalized.match(compatRe);
  if (cm) {
    const target = cleanTarget(cm[1]);
    compatibility.push({
      kind: "compatibility",
      value: target,
      hardness: "hard",
      sourceText: `compatible with ${target}`,
    });
    const start = cm.index! + cm[0].indexOf(cm[1]);
    excludedSpans.push([start, start + cm[1].length]);
  }

  // "for X" (device → compatibility, use → intended use)
  const forRe = /\bfor\s+(?:the\s+|a\s+|an\s+)?([a-z0-9]+(?:\s+[a-z0-9]+){0,2})/g;
  let fm: RegExpMatchArray | null;
  while ((fm = forRe.exec(normalized)) !== null) {
    const target = cleanTarget(fm[1]);
    if (!target) continue;
    const start = fm.index! + fm[0].indexOf(fm[1]);
    if (isCompatibilityTarget(target)) {
      compatibility.push({
        kind: "compatibility",
        value: target,
        hardness: "hard",
        sourceText: `for ${target}`,
      });
      excludedSpans.push([start, start + fm[1].length]);
    } else if (isUseTarget(target)) {
      const canonical =
        USE_SYNONYMS[target] ?? USE_SYNONYMS[target.split(/\s+/)[0]] ?? target;
      intendedUse.push({
        kind: "intended_use",
        value: canonical,
        hardness: "soft",
        sourceText: `for ${target}`,
      });
      excludedSpans.push([start, start + fm[1].length]);
    }
  }

  return { compatibility, intendedUse, excludedSpans };
}

function applyHardness(
  constraints: ShopperConstraint[],
  normalized: string,
): ShopperConstraint[] {
  const mustOnly = /\b(must|only)\b/.test(normalized);
  return constraints.map((c) => {
    let hardness = DEFAULT_HARDNESS[c.kind];
    if (hardness === "soft" && mustOnly) hardness = "hard";
    return { ...c, hardness };
  });
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Options for constraint extraction.
 */
export interface ExtractOptions {
  /**
   * Canonical colors the catalog supports as facets. When provided, only these
   * colors are extracted; other recognized color words are ignored (they are
   * not catalog-supported and therefore cannot be satisfied).
   */
  supportedColors?: ReadonlySet<string>;
}

/**
 * Extract constraints from a raw English shopper query. Deterministic and
 * LLM-free. Every returned constraint carries the `sourceText` fragment it was
 * derived from.
 */
export function extractConstraints(
  query: string,
  options: ExtractOptions = {},
): ShopperConstraint[] {
  const normalized = normalize(query);
  const constraints: ShopperConstraint[] = [];

  constraints.push(...extractPrice(normalized));
  constraints.push(...extractSize(query, normalized));

  const { compatibility, intendedUse, excludedSpans } =
    extractForAndCompatibility(normalized);
  constraints.push(...compatibility, ...intendedUse);

  constraints.push(...extractColor(query, normalized, options.supportedColors));
  constraints.push(...extractCategory(normalized, excludedSpans));

  return applyHardness(constraints, normalized);
}
