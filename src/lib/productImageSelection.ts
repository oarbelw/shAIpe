import type { Product } from "@prisma/client";
import { getGeminiClient, GEMINI_TEXT_MODEL } from "@/lib/gemini";
import { readStoredFile, storagePathFromUrl } from "@/lib/storage";

async function loadImageBytes(url: string): Promise<{
  data: string;
  mimeType: string;
} | null> {
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

/** Heuristic URL scoring when vision pick is unavailable. */
function scoreProductImageUrl(url: string): number {
  const lower = url.toLowerCase();
  let score = 0;
  if (/flat|layflat|lay-flat|product[_-]?only|ghost|pack/.test(lower)) score += 5;
  if (/front|detail|zoom|close/.test(lower)) score += 2;
  if (/banner|hero|lifestyle|campaign|lookbook|model/.test(lower)) score -= 3;
  if (lower.includes("width=1") || lower.includes("width=2")) score += 1;
  return score;
}

/**
 * Pick the single best product photo for try-on reference.
 * Prefers flat-lay / isolated product shots over lifestyle model photos.
 */
export async function pickBestProductReferenceImage(
  product: Product,
  urls: string[]
): Promise<string | undefined> {
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return undefined;
  if (unique.length === 1) return unique[0];

  const client = getGeminiClient();
  const candidates = unique.slice(0, 6);
  const loaded = await Promise.all(
    candidates.map(async (url) => ({ url, image: await loadImageBytes(url) }))
  );
  const valid = loaded.filter((entry): entry is { url: string; image: NonNullable<typeof entry.image> } =>
    Boolean(entry.image)
  );

  if (valid.length === 0) {
    return [...unique].sort((a, b) => scoreProductImageUrl(b) - scoreProductImageUrl(a))[0];
  }
  if (valid.length === 1) return valid[0].url;

  if (client) {
    try {
      const parts: Array<
        { text: string } | { inlineData: { data: string; mimeType: string } }
      > = [
        {
          text: `You are selecting the best product reference photo for a virtual clothing try-on of "${product.title}".

Pick the image that shows the GARMENT DESIGN most clearly for reproduction:
- BEST: flat-lay, product-only, or clear front view of the item alone showing colors and printed graphics
- AVOID: lifestyle photos where a model wears the item (unless it is the only option), banner crops, or photos that hide the garment design

Return JSON with bestIndex (0-based index among the attached images).`,
        },
      ];

      for (let i = 0; i < valid.length; i++) {
        parts.push({ text: `Image ${i}:` });
        parts.push({
          inlineData: {
            data: valid[i].image.data,
            mimeType: valid[i].image.mimeType,
          },
        });
      }

      const response = await client.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: [{ role: "user", parts }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: { bestIndex: { type: "integer" } },
            required: ["bestIndex"],
          },
        },
      });

      const parsed = JSON.parse(response.text ?? "{}") as { bestIndex?: number };
      if (
        typeof parsed.bestIndex === "number" &&
        parsed.bestIndex >= 0 &&
        parsed.bestIndex < valid.length
      ) {
        return valid[parsed.bestIndex].url;
      }
    } catch (error) {
      console.error("Product image selection failed, using heuristics:", error);
    }
  }

  return [...valid]
    .sort((a, b) => scoreProductImageUrl(b.url) - scoreProductImageUrl(a.url))[0].url;
}
