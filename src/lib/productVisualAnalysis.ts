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

export function formatVisualSpecForPrompt(spec: ProductVisualSpec): string {
  const lines = [
    `- Primary color: ${spec.primaryColor}`,
    spec.accentColors?.length ? `- Accent colors: ${spec.accentColors.join(", ")}` : null,
    spec.logosAndGraphics ? `- Logos/graphics/text: ${spec.logosAndGraphics}` : null,
    spec.patternAndTexture ? `- Pattern/texture: ${spec.patternAndTexture}` : null,
    spec.keyDetails?.length ? `- Key construction details: ${spec.keyDetails.join("; ")}` : null,
    spec.reproductionNotes ? `- Reproduction notes: ${spec.reproductionNotes}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

function fallbackVisualSpec(product: Product): ProductVisualSpec | null {
  const hints = extractColorHintsFromProduct(product);
  if (hints.length === 0 && !product.description) return null;

  return {
    primaryColor: hints[0] ?? "match the product reference image exactly",
    logosAndGraphics: product.description?.slice(0, 300),
    reproductionNotes:
      "Match the attached product reference image exactly. Do not infer colors from the brand or product name.",
  };
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
 * Uses Gemini vision to extract exact visual details from the product photo so
 * generation copies color/logos from the image — not from brand-name associations.
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
      ? `Scraped color hints from the product page (may supplement the image): ${textHints.join(", ")}`
      : "No scraped color hints.";

  try {
    const response = await client.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are analyzing a clothing product photo for a virtual try-on system.
Describe ONLY what you see in the image — exact colors, logos, printed text, graphics, trim, fabric texture, and distinctive details.

Product metadata (may be misleading — trust the image over names):
- Title: ${product.title}
- Brand: ${product.brand ?? "unknown"}
- Description: ${product.description?.slice(0, 800) ?? "none"}
- ${hintLine}

CRITICAL: Do NOT infer color from brand or product names. Example: brand "Strawberry Milk Mob" or text "STRAWBERRY" does NOT mean pink/red unless the garment in the photo is actually pink/red.

Return JSON describing how to reproduce this exact item visually.`,
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

    return {
      primaryColor: parsed.primaryColor.trim(),
      accentColors: parsed.accentColors?.filter(Boolean),
      logosAndGraphics: parsed.logosAndGraphics?.trim(),
      patternAndTexture: parsed.patternAndTexture?.trim(),
      keyDetails: parsed.keyDetails?.filter(Boolean),
      reproductionNotes: parsed.reproductionNotes?.trim(),
    };
  } catch (error) {
    console.error("Product visual analysis failed, using text fallback:", error);
    return fallbackVisualSpec(product);
  }
}
