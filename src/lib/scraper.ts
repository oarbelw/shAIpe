import * as cheerio from "cheerio";
import { scrapedProductSchema, type ScrapedProduct } from "@/lib/validators";

/**
 * Product page scraper.
 *
 * Strategy:
 *   1. Static fetch + cheerio (fast path for open sites)
 *   2. Detect bot/challenge pages (Cloudflare, Akamai) and discard them
 *   3. Playwright headless browser for JS-heavy / bot-protected retailers
 *      (Aritzia, Zara, many fashion sites)
 *   4. JSON-LD, Open Graph, __NEXT_DATA__, and embedded product JSON
 *
 * Some retailers (e.g. Levi's via Akamai) block all automated access from
 * certain networks — those will still fail and the UI falls back to manual
 * product image upload.
 */

export async function scrapeProduct(url: string): Promise<ScrapedProduct> {
  let html = await fetchStatic(url);
  let result = html && !isBlockedPage(html) ? extractFromHtml(html, url) : null;

  if (!result || isLowQuality(result)) {
    const rendered = await fetchWithPlaywright(url);
    if (rendered && !isBlockedPage(rendered)) {
      const renderedResult = extractFromHtml(rendered, url);
      if (renderedResult && (!result || qualityScore(renderedResult) > qualityScore(result))) {
        result = renderedResult;
      }
    }
  }

  if (!result || isBlockedTitle(result.title)) {
    throw new ScrapeError(
      "This store blocked our product reader. Paste the product image manually instead — it works just as well for try-ons."
    );
  }

  return scrapedProductSchema.parse(result);
}

export class ScrapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScrapeError";
  }
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

async function fetchStatic(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Reuse one browser instance across scrapes to avoid ~2s launch overhead each time. */
let browserPromise: Promise<import("playwright").Browser> | null = null;

async function getBrowser(): Promise<import("playwright").Browser> {
  if (!browserPromise) {
    const { chromium } = await import("playwright");
    browserPromise = chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
      ],
    });
  }
  return browserPromise;
}

async function fetchWithPlaywright(url: string): Promise<string | null> {
  let browser: import("playwright").Browser | null = null;
  let context: import("playwright").BrowserContext | null = null;

  try {
    browser = await getBrowser();
    context = await browser.newContext({
      userAgent: BROWSER_HEADERS["User-Agent"],
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
      extraHTTPHeaders: {
        "Accept-Language": BROWSER_HEADERS["Accept-Language"],
      },
    });

    const page = await context.newPage();

    // Hide webdriver flag — helps with some bot checks.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

    // Wait for a real product page to render (not a challenge interstitial).
    await Promise.race([
      page.waitForSelector('script[type="application/ld+json"]', { timeout: 12000 }).catch(() => null),
      page.waitForSelector('meta[property="og:image"]', { timeout: 12000 }).catch(() => null),
      page.waitForSelector("#__NEXT_DATA__", { timeout: 12000 }).catch(() => null),
      page.waitForTimeout(6000),
    ]);

    const html = await page.content();
    return isBlockedPage(html) ? null : html;
  } catch (error) {
    console.error("Playwright scrape failed:", error);
    return null;
  } finally {
    await context?.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Bot / challenge page detection
// ---------------------------------------------------------------------------

const BLOCKED_TITLE_PATTERNS = [
  /^just a moment/i,
  /^access denied/i,
  /^attention required/i,
  /^please wait/i,
  /^robot or human/i,
  /^verify you are human/i,
  /^security check/i,
  /^403 forbidden/i,
  /^503 service/i,
  /^error$/i,
];

function isBlockedTitle(title: string): boolean {
  const t = title.trim();
  if (!t || t.length < 3) return true;
  return BLOCKED_TITLE_PATTERNS.some((re) => re.test(t));
}

function isBlockedPage(html: string): boolean {
  const lower = html.toLowerCase();
  if (html.length < 8000) {
    if (lower.includes("just a moment")) return true;
    if (lower.includes("access denied")) return true;
    if (lower.includes("errors.edgesuite.net")) return true;
    if (lower.includes("challenge-platform")) return true;
    if (lower.includes("cf-browser-verification")) return true;
    if (lower.includes("akamai") && lower.includes("access denied")) return true;
  }
  const title = html.match(/<title[^>]*>([^<]+)/i)?.[1] ?? "";
  return isBlockedTitle(title);
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function extractFromHtml(html: string, url: string): ScrapedProduct | null {
  const $ = cheerio.load(html);

  const jsonLd = extractJsonLdProduct($);
  const nextData = extractNextDataProduct($);
  const embedded = extractEmbeddedProductJson(html);
  const og = extractOpenGraph($);

  const title =
    jsonLd?.title ??
    nextData?.title ??
    embedded?.title ??
    og.title ??
    $("title").first().text().trim() ??
    undefined;

  if (!title || isBlockedTitle(title)) return null;

  const images = dedupe(
    [
      ...(jsonLd?.images ?? []),
      ...(nextData?.images ?? []),
      ...(embedded?.images ?? []),
      ...(og.images ?? []),
      ...extractImgTags($, url),
    ].map((i) => absolutize(i, url))
  ).slice(0, 12);

  const rawScrapedText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 4000);

  return {
    url,
    title: title.slice(0, 300),
    brand: jsonLd?.brand ?? nextData?.brand ?? embedded?.brand ?? og.siteName,
    price: jsonLd?.price ?? nextData?.price ?? embedded?.price ?? og.price,
    currency: jsonLd?.currency ?? nextData?.currency ?? embedded?.currency ?? og.currency,
    description: (jsonLd?.description ?? nextData?.description ?? embedded?.description ?? og.description)?.slice(
      0,
      2000
    ),
    category: jsonLd?.category ?? nextData?.category ?? embedded?.category,
    images,
    availableSizes: dedupe([
      ...(jsonLd?.sizes ?? []),
      ...(nextData?.sizes ?? []),
      ...(embedded?.sizes ?? []),
    ]),
    colors: dedupe([
      ...(jsonLd?.colors ?? []),
      ...(nextData?.colors ?? []),
      ...(embedded?.colors ?? []),
    ]),
    material:
      jsonLd?.material ??
      nextData?.material ??
      embedded?.material ??
      extractMaterialFromText(rawScrapedText),
    fitDescription:
      jsonLd?.fitDescription ??
      nextData?.fitDescription ??
      embedded?.fitDescription ??
      extractFitFromText(rawScrapedText),
    rawScrapedText: rawScrapedText || undefined,
  };
}

type ProductFields = {
  title?: string;
  brand?: string;
  price?: string;
  currency?: string;
  description?: string;
  category?: string;
  images?: string[];
  sizes?: string[];
  colors?: string[];
  material?: string;
  fitDescription?: string;
};

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

function extractJsonLdProduct($: cheerio.CheerioAPI): ProductFields | null {
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    const raw = $(el).contents().text();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const product = findProductNode(parsed);
    if (product) return product;
  }
  return null;
}

function findProductNode(node: unknown): ProductFields | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProductNode(item);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;

  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.includes("Product")) return mapJsonLdProduct(obj);

  if (obj["@graph"]) return findProductNode(obj["@graph"]);
  return null;
}

function mapJsonLdProduct(obj: Record<string, unknown>): ProductFields {
  const offersRaw = obj.offers;
  const offers = (Array.isArray(offersRaw) ? offersRaw : [offersRaw]).filter(
    (o): o is Record<string, unknown> => !!o && typeof o === "object"
  );
  const firstOffer = offers[0];

  const sizes = dedupe(
    offers
      .flatMap((o) => {
        const size = o.size;
        return Array.isArray(size) ? size : size ? [size] : [];
      })
      .filter((s): s is string => typeof s === "string")
  );

  const brandRaw = obj.brand;
  const brand =
    typeof brandRaw === "string"
      ? brandRaw
      : brandRaw && typeof brandRaw === "object"
        ? str((brandRaw as Record<string, unknown>).name)
        : undefined;

  const imageRaw = obj.image;
  const images = (Array.isArray(imageRaw) ? imageRaw : [imageRaw])
    .map((img) =>
      typeof img === "string"
        ? img
        : img && typeof img === "object"
          ? str((img as Record<string, unknown>).url ?? (img as Record<string, unknown>).contentUrl)
          : undefined
    )
    .filter((i): i is string => !!i);

  const colorRaw = obj.color;
  const colors = (Array.isArray(colorRaw) ? colorRaw : [colorRaw])
    .filter((c): c is string => typeof c === "string");

  return {
    title: str(obj.name),
    brand,
    description: str(obj.description),
    category: str(obj.category),
    material: str(obj.material),
    images,
    sizes,
    colors,
    price: firstOffer ? (str(firstOffer.price) ?? str(firstOffer.lowPrice)) : undefined,
    currency: firstOffer ? str(firstOffer.priceCurrency) : undefined,
  };
}

// ---------------------------------------------------------------------------
// __NEXT_DATA__ (Next.js SSR hydration blob)
// ---------------------------------------------------------------------------

function extractNextDataProduct($: cheerio.CheerioAPI): ProductFields | null {
  const raw = $("#__NEXT_DATA__").html();
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return findProductInObject(data?.props?.pageProps ?? data);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Embedded product JSON in <script> tags (Shopify, SFCC, custom stores)
// ---------------------------------------------------------------------------

function extractEmbeddedProductJson(html: string): ProductFields | null {
  const patterns = [
    /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/,
    /window\.ShopifyAnalytics\.meta\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/,
    /"product"\s*:\s*(\{"id"[\s\S]*?"variants"[\s\S]*?\})/,
    /var\s+product\s*=\s*(\{[\s\S]*?\});/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    try {
      const parsed = JSON.parse(match[1]);
      const found = findProductInObject(parsed);
      if (found?.title) return found;
    } catch {
      continue;
    }
  }
  return null;
}

/** Walk an arbitrary JSON tree looking for a product-shaped object. */
function findProductInObject(node: unknown, depth = 0): ProductFields | null {
  if (depth > 8 || node == null) return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProductInObject(item, depth + 1);
      if (found?.title && (found.images?.length || found.price)) return found;
    }
    return null;
  }

  if (typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;

  // Direct product object (Shopify, custom APIs)
  if (typeof obj.title === "string" && (obj.images || obj.variants || obj.image)) {
    return mapGenericProduct(obj);
  }
  if (typeof obj.name === "string" && (obj.offers || obj.image || obj.images)) {
    return mapGenericProduct({ ...obj, title: obj.name });
  }

  // Common wrapper keys
  for (const key of ["product", "productData", "productDetail", "item", "data"]) {
    if (obj[key]) {
      const found = findProductInObject(obj[key], depth + 1);
      if (found?.title) return found;
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const found = findProductInObject(value, depth + 1);
      if (found?.title && (found.images?.length || found.price)) return found;
    }
  }
  return null;
}

function mapGenericProduct(obj: Record<string, unknown>): ProductFields {
  const images: string[] = [];

  const imageRaw = obj.images ?? obj.image;
  if (Array.isArray(imageRaw)) {
    for (const img of imageRaw) {
      if (typeof img === "string") images.push(img);
      else if (img && typeof img === "object") {
        const url = str((img as Record<string, unknown>).src ?? (img as Record<string, unknown>).url);
        if (url) images.push(url);
      }
    }
  } else if (typeof imageRaw === "string") {
    images.push(imageRaw);
  }

  const variants = Array.isArray(obj.variants) ? obj.variants : [];
  const sizes = dedupe(
    variants
      .map((v) => (v && typeof v === "object" ? str((v as Record<string, unknown>).title ?? (v as Record<string, unknown>).option1) : undefined))
      .filter((s): s is string => !!s && s.length < 20)
  );

  const priceRaw = obj.price ?? obj.price_min ?? (variants[0] && typeof variants[0] === "object" ? (variants[0] as Record<string, unknown>).price : undefined);
  const price =
    typeof priceRaw === "number"
      ? (priceRaw / 100).toFixed(2)
      : typeof priceRaw === "string"
        ? priceRaw
        : undefined;

  return {
    title: str(obj.title ?? obj.name),
    brand: str(obj.vendor ?? obj.brand),
    description: str(obj.description ?? obj.body_html)?.replace(/<[^>]+>/g, " ").slice(0, 2000),
    images,
    sizes,
    colors: typeof obj.color === "string" ? [obj.color] : [],
    price,
    currency: str(obj.currency),
    material: str(obj.material ?? obj.fabric),
  };
}

// ---------------------------------------------------------------------------
// Open Graph
// ---------------------------------------------------------------------------

type OpenGraphData = {
  title?: string;
  description?: string;
  siteName?: string;
  images?: string[];
  price?: string;
  currency?: string;
};

function extractOpenGraph($: cheerio.CheerioAPI): OpenGraphData {
  const meta = (prop: string) =>
    $(`meta[property="${prop}"], meta[name="${prop}"]`).attr("content")?.trim() || undefined;

  const images = [
    ...$('meta[property="og:image"]').toArray(),
    ...$('meta[name="twitter:image"]').toArray(),
  ]
    .map((el) => $(el).attr("content")?.trim())
    .filter((i): i is string => !!i);

  return {
    title: meta("og:title") ?? meta("twitter:title"),
    description: meta("og:description") ?? meta("description"),
    siteName: meta("og:site_name"),
    images,
    price: meta("product:price:amount") ?? meta("og:price:amount"),
    currency: meta("product:price:currency") ?? meta("og:price:currency"),
  };
}

function extractImgTags($: cheerio.CheerioAPI, baseUrl: string): string[] {
  return $("img")
    .toArray()
    .flatMap((el) => {
      const src = $(el).attr("src") ?? $(el).attr("data-src") ?? $(el).attr("data-srcset")?.split(" ")[0];
      return src ? [src] : [];
    })
    .filter((src) => !src.startsWith("data:") && !src.includes("1x1"))
    .filter((src) => /\.(jpe?g|png|webp)/i.test(src) || src.includes("cdn") || src.includes("image"))
    .map((src) => absolutize(src, baseUrl))
    .slice(0, 8);
}

const MATERIAL_RE =
  /(\d{1,3}%\s*(?:cotton|polyester|nylon|elastane|spandex|wool|viscose|rayon|linen|silk|cashmere|modal|lyocell|tencel)(?:[,/]?\s*\d{1,3}%\s*\w+)*)/i;

function extractMaterialFromText(text: string): string | undefined {
  return text.match(MATERIAL_RE)?.[1]?.slice(0, 200);
}

const FIT_RE =
  /((?:slim|relaxed|oversized|regular|loose|fitted|boxy|cropped|tailored)\s+fit[^.]{0,120})/i;

function extractFitFromText(text: string): string | undefined {
  return text.match(FIT_RE)?.[1]?.trim().slice(0, 200);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isLowQuality(result: ScrapedProduct): boolean {
  return qualityScore(result) < 2;
}

function qualityScore(result: ScrapedProduct): number {
  let score = 0;
  if (result.images.length > 0) score += 3;
  if (result.description) score += 1;
  if (result.price) score += 1;
  if (result.availableSizes.length > 0) score += 1;
  if (result.brand) score += 1;
  // Generic one-word titles like just the store name are low quality
  if (result.title.split(/\s+/).length >= 3) score += 1;
  return score;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function absolutize(src: string, baseUrl: string): string {
  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return src;
  }
}
