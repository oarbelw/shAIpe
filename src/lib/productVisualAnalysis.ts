import type { Product } from "@prisma/client";
import { parseJsonArray } from "@/lib/db";
import { getGeminiClient, GEMINI_TEXT_MODEL } from "@/lib/gemini";
import { storagePathFromUrl, readStoredFile } from "@/lib/storage";

export type ProductVisualSpec = {
  primaryColor: string;
  accentColors?: string[];
  logosAndGraphics?: string;
  patternAndTexture?: string;
  keyDetails?: string[];
  reproductionNotes?: string;
};

const COLOR_WORDS =
  /\b(black|white|off[- ]white|cream|ivory|grey|gray|charcoal|silver|red|maroon|burgundy|pink|blush|rose|orange|yellow|gold|green|teal|emerald|olive|lime|mint|blue|navy|cobalt|sky|purple|violet|lavender|brown|tan|beige|khaki|camel|denim|indigo|multicolor|multi-color)\b/gi;

const MARKETING_COPY_RE =
  /\b(lining|inseam|pocket|shipping|checkout|hand-wash|machine wash|for the first time|let us know|summer style|retailer|add to cart|true to size|washing instructions|return policy)\b/i;

/**
 * Pull explicit color mentions from scraped product copy, e.g.
 * "Green with STRAWBERRY logo on front" on Strawberry Milk Mob.
 */
export function extractColorHintsFromProduct(product: Product): string[] {
  const chunks = [product.description, product.rawScrapedText, product.fitDescription].filter(
    Boolean
  ) as string[];

  const hints = new Set<string>();
  for (const chunk of chunks) {
    const greenWith = chunk.match(
      /\b(black|white|grey|gray|red|pink|orange|yellow|green|teal|emerald|olive|blue|navy|purple|brown|tan|beige|khaki)\s+with\b/i
    );
    if (greenWith) hints.add(greenWith[1].toLowerCase());

    for (const match of chunk.matchAll(COLOR_WORDS)) {
      hints.add(match[1].toLowerCase());
    }
  }

  const scrapedColors = parseJsonArray(product.colors);
  for (const c of scrapedColors) hints.add(c.toLowerCase());

  return [...hints];
}

/** Extract short garment-graphic hints from bullet lines, not marketing paragraphs. */
export function extractGarmentGraphicHint(product: Product): string | null {
  const sources = [product.description, product.rawScrapedText].filter(Boolean) as string[];

  for (const source of sources) {
    const bulletMatch = source.match(
      /\b(black|white|grey|gray|red|pink|orange|yellow|green|teal|emerald|olive|blue|navy|purple|brown|tan|beige|khaki)\s+with\s+["']?([^"'\n.]{1,40})["']?\s+(?:logo|text|print|on front|on back)/i
    );
    if (bulletMatch) {
      return `${bulletMatch[1]} with "${bulletMatch[2].trim()}" on the garment`;
    }
  }

  return null;
}

export function looksLikeMarketingCopy(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length > 120) return true;
  if (MARKETING_COPY_RE.test(trimmed)) return true;
  if (trimmed.split(/\s+/).length > 18) return true;
  return false;
}

export function sanitizeVisualSpec(spec: ProductVisualSpec): ProductVisualSpec {
  return {
    ...spec,
    logosAndGraphics:
      spec.logosAndGraphics && !looksLikeMarketingCopy(spec.logosAndGraphics)
        ? spec.logosAndGraphics
        : undefined,
    keyDetails: spec.keyDetails?.filter((detail) => !looksLikeMarketingCopy(detail)),
    reproductionNotes:
      spec.reproductionNotes && !looksLikeMarketingCopy(spec.reproductionNotes)
        ? spec.reproductionNotes
        : "Copy only graphics printed on the fabric in the product photo. Never print website descriptions or feature lists on the garment.",
  };
}

export function formatVisualSpecForPrompt(spec: ProductVisualSpec): string {
  const lines = [
    `- Primary color: ${spec.primaryColor}`,
    spec.accentColors?.length ? `- Accent colors: ${spec.accentColors.join(", ")}` : null,
    spec.logosAndGraphics ? `- Graphics printed ON the garment: ${spec.logosAndGraphics}` : null,
    spec.patternAndTexture ? `- Pattern/texture: ${spec.patternAndTexture}` : null,
    spec.keyDetails?.length
      ? `- Visible construction details: ${spec.keyDetails.join("; ")}`
      : null,
    spec.reproductionNotes ? `- Notes: ${spec.reproductionNotes}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

function fallbackVisualSpec(product: Product): ProductVisualSpec | null {
  const hints = extractColorHintsFromProduct(product);
  const graphicHint = extractGarmentGraphicHint(product);
  if (hints.length === 0 && !graphicHint) return null;

  return sanitizeVisualSpec({
    primaryColor: hints[0] ?? "match the product reference image exactly",
    logosAndGraphics: graphicHint ?? undefined,
    reproductionNotes:
      "Match the product reference photo exactly. Do not print marketing copy or product descriptions on the garment.",
  });
}

async function loadImageForAnalysis(url?: string | null): Promise<{
  data: string;
  mimeType: string;
} | null> {
  if (!url) return null;

  const storagePath = storagePathFromUrl(url);
  if (storagePath) {
    const file = await readStoredFile(storagePath);
    if (!file || file.data.length > 6_000_000) return null;
    return { data: file.data.toString("base64"), mimeType: file.mimeType };
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type")?.split(";")[0].trim() ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > 6_000_000) return null;
    return { data: buffer.toString("base64"), mimeType: contentType };
  } catch {
    return null;
  }
}

/**
 * Uses Gemini vision to extract exact visual details from the product photo.
 * Deliberately ignores product descriptions — image pixels only.
 */
export async function analyzeProductVisual(
  product: Product,
  productImageUrl?: string | null
): Promise<ProductVisualSpec | null> {
  const client = getGeminiClient();
  const image = await loadImageForAnalysis(productImageUrl);

  if (!client || !image) {
    return fallbackVisualSpec(product);
  }

  const textHints = extractColorHintsFromProduct(product);
  const hintLine =
    textHints.length > 0
      ? `Color hints from product page (colors only, not text to print): ${textHints.join(", ")}`
      : "No color hints.";

  const graphicHint = extractGarmentGraphicHint(product);

  try {
    const response = await client.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Analyze this clothing product PHOTO for virtual try-on reproduction.

Describe ONLY what is physically visible ON THE GARMENT in the image:
- Fabric color(s)
- Logos, brand marks, or printed text that are physically printed/embroidered on the fabric
- Trim, piping, drawstrings, pockets visible in the photo
- Pattern and texture

Product context (for identification only — do NOT copy website/marketing text onto the garment):
- Title: ${product.title}
- Brand: ${product.brand ?? "unknown"}
- ${hintLine}
${graphicHint ? `- Garment graphic hint from product specs: ${graphicHint}` : ""}

CRITICAL RULES:
- Do NOT include product descriptions, marketing copy, feature bullet points, or care instructions.
- Do NOT infer color from brand names (e.g. "Strawberry" ≠ pink).
- logosAndGraphics must ONLY describe text/graphics physically printed on the fabric in THIS photo.
- If the photo shows a model wearing the item, still describe the garment design visible in the photo.

Return JSON.`,
            },
            {
              inlineData: {
                data: image.data,
                mimeType: image.mimeType,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            primaryColor: { type: "string" },
            accentColors: { type: "array", items: { type: "string" } },
            logosAndGraphics: { type: "string" },
            patternAndTexture: { type: "string" },
            keyDetails: { type: "array", items: { type: "string" } },
            reproductionNotes: { type: "string" },
          },
          required: ["primaryColor"],
        },
      },
    });

    const text = response.text;
    if (!text) return fallbackVisualSpec(product);

    const parsed = JSON.parse(text) as ProductVisualSpec;
    if (!parsed.primaryColor?.trim()) return fallbackVisualSpec(product);

    return sanitizeVisualSpec({
      primaryColor: parsed.primaryColor.trim(),
      accentColors: parsed.accentColors?.filter(Boolean),
      logosAndGraphics: parsed.logosAndGraphics?.trim(),
      patternAndTexture: parsed.patternAndTexture?.trim(),
      keyDetails: parsed.keyDetails?.filter(Boolean),
      reproductionNotes: parsed.reproductionNotes?.trim(),
    });
  } catch (error) {
    console.error("Product visual analysis failed, using text fallback:", error);
    return fallbackVisualSpec(product);
  }
}
