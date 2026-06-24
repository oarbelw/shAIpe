import { readStoredFile, saveFile, storagePathFromUrl } from "@/lib/storage";
import { buildTryOnPrompt, type TryOnPromptContext } from "@/lib/promptBuilder";
import { getGeminiClient, GEMINI_IMAGE_MODEL } from "@/lib/gemini";
import type { Product, User, UserImage, UserProfile } from "@prisma/client";

// ---------------------------------------------------------------------------
// Provider abstraction (spec section 12). The active provider is selected in
// getImageGenerationProvider(): Gemini when GEMINI_API_KEY is set, otherwise
// the mock provider so the app still works end-to-end without a key.
// ---------------------------------------------------------------------------

export type TryOnGenerationInput = {
  user: User;
  profile: UserProfile | null;
  referenceImages: UserImage[];
  product: Product;
  productImageUrl?: string;
  selectedSize?: string | null;
  selectedColor?: string | null;
  userNotes?: string | null;
  views: Array<"front" | "side" | "back">;
  /** Called as each view finishes, so the UI can show images progressively. */
  onImage?: (url: string) => Promise<void> | void;
};

export type TryOnGenerationResult = {
  /** URLs (served via /api/files) of the generated images. */
  imageUrls: string[];
  provider: string;
};

export type VariationGenerationInput = {
  user: User;
  product: Product;
  /** A previously generated try-on image to modify. */
  baseImageUrl: string;
  /** The user's modification request, e.g. "make the shirt red". */
  variationPrompt: string;
};

export interface ImageGenerationProvider {
  generateTryOn(input: TryOnGenerationInput): Promise<TryOnGenerationResult>;
  generateVariation(input: VariationGenerationInput): Promise<TryOnGenerationResult>;
}

export function getImageGenerationProvider(): ImageGenerationProvider {
  if (getGeminiClient()) return new GeminiImageGenerationProvider();
  return new MockImageGenerationProvider();
}

// ---------------------------------------------------------------------------
// Gemini provider
// ---------------------------------------------------------------------------

type ImageBytes = { data: Buffer; mimeType: string };

/**
 * Generates try-on images with a Gemini image model (default
 * gemini-3.1-flash-image). Each view is one generation call conditioned on
 * the matching user reference photo plus the product image.
 */
class GeminiImageGenerationProvider implements ImageGenerationProvider {
  async generateTryOn(input: TryOnGenerationInput): Promise<TryOnGenerationResult> {
    const client = getGeminiClient();
    if (!client) throw new Error("Gemini client not configured");

    const productImage = await loadImageBytes(input.productImageUrl);
    const imageUrls: string[] = [];
    let lastError: unknown;

    for (const view of input.views) {
      const reference =
        input.referenceImages.find((img) => img.angle === view) ??
        input.referenceImages.find((img) => img.angle === "front") ??
        input.referenceImages[0];

      const referenceImage = reference ? await loadImageBytes(reference.imageUrl) : null;
      if (!referenceImage) continue;

      const prompt = buildTryOnPrompt({ ...promptContext(input), view });

      const parts: Array<
        { text: string } | { inlineData: { data: string; mimeType: string } }
      > = [
        { text: prompt },
        { text: "Reference photo of the user:" },
        {
          inlineData: {
            data: referenceImage.data.toString("base64"),
            mimeType: referenceImage.mimeType,
          },
        },
      ];
      if (productImage) {
        parts.push(
          { text: "The clothing item to try on:" },
          {
            inlineData: {
              data: productImage.data.toString("base64"),
              mimeType: productImage.mimeType,
            },
          }
        );
      }

      try {
        const response = await client.models.generateContent({
          model: GEMINI_IMAGE_MODEL,
          contents: [{ role: "user", parts }],
          config: {
            responseModalities: ["IMAGE"],
            imageConfig: { aspectRatio: "3:4" },
          },
        });

        const generated = extractImagePart(response);
        if (!generated) {
          lastError = new Error(`Gemini returned no image for ${view} view`);
          console.error(lastError);
          continue;
        }

        const saved = await saveFile(
          input.user.id,
          Buffer.from(generated.data, "base64"),
          generated.mimeType,
          `tryon-${view}`
        );
        imageUrls.push(saved.url);
        await input.onImage?.(saved.url);
      } catch (error) {
        lastError = error;
        console.error(`Gemini try-on generation failed for ${view} view:`, error);
      }
    }

    if (imageUrls.length === 0) {
      throw lastError instanceof Error
        ? lastError
        : new Error("Gemini try-on generation produced no images");
    }

    return { imageUrls, provider: `gemini:${GEMINI_IMAGE_MODEL}` };
  }

  async generateVariation(input: VariationGenerationInput): Promise<TryOnGenerationResult> {
    const client = getGeminiClient();
    if (!client) throw new Error("Gemini client not configured");

    const baseImage = await loadImageBytes(input.baseImageUrl);
    if (!baseImage) throw new Error("Could not load the original try-on image");

    const prompt = `This is an AI-generated try-on image of a person wearing "${input.product.title}"${
      input.product.brand ? ` by ${input.product.brand}` : ""
    }.

Create a modified version of this exact image with the following change:
${input.variationPrompt}

Rules:
- Keep the person's face, identity, body shape, hair, skin tone, pose, and proportions exactly the same.
- Keep the photographic style, lighting, and clean neutral background the same.
- Only apply the requested change; leave everything else untouched.
- Keep the result photorealistic.
- Do not make the person thinner, larger, younger, or more sexualized.`;

    const response = await client.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: baseImage.data.toString("base64"),
                mimeType: baseImage.mimeType,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "3:4" },
      },
    });

    const generated = extractImagePart(response);
    if (!generated) throw new Error("Gemini returned no image for the variation");

    const saved = await saveFile(
      input.user.id,
      Buffer.from(generated.data, "base64"),
      generated.mimeType,
      "tryon-variation"
    );

    return { imageUrls: [saved.url], provider: `gemini:${GEMINI_IMAGE_MODEL}` };
  }
}

type GeminiResponseLike = {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
  }>;
};

function extractImagePart(
  response: GeminiResponseLike
): { data: string; mimeType: string } | null {
  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return {
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType ?? "image/png",
        };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mock provider
// ---------------------------------------------------------------------------

/**
 * Produces a stylized SVG "preview card" per requested view, compositing the
 * user's reference photo with the product image, so the whole try-on flow
 * works end-to-end before a real model is plugged in.
 */
class MockImageGenerationProvider implements ImageGenerationProvider {
  async generateTryOn(input: TryOnGenerationInput): Promise<TryOnGenerationResult> {
    const imageUrls: string[] = [];

    const productImage = await loadImageAsDataUri(input.productImageUrl);

    for (const view of input.views) {
      // The prompt is built exactly as a real provider would receive it.
      buildTryOnPrompt({ ...promptContext(input), view });

      const reference =
        input.referenceImages.find((img) => img.angle === view) ??
        input.referenceImages.find((img) => img.angle === "front") ??
        input.referenceImages[0];

      const referenceImage = reference
        ? await loadImageAsDataUri(reference.imageUrl)
        : null;

      const svg = renderMockSvg({
        view,
        productTitle: input.product.title,
        brand: input.product.brand,
        selectedSize: input.selectedSize,
        referenceImage,
        productImage,
      });

      const saved = await saveFile(
        input.user.id,
        Buffer.from(svg, "utf-8"),
        "image/svg+xml",
        `tryon-${view}`
      );
      imageUrls.push(saved.url);
      await input.onImage?.(saved.url);
    }

    return { imageUrls, provider: "mock" };
  }

  async generateVariation(input: VariationGenerationInput): Promise<TryOnGenerationResult> {
    const baseImage = await loadImageAsDataUri(input.baseImageUrl);
    const svg = renderMockSvg({
      view: "front",
      productTitle: `${input.product.title} — ${input.variationPrompt}`,
      brand: input.product.brand,
      selectedSize: null,
      referenceImage: baseImage,
      productImage: null,
    });

    const saved = await saveFile(
      input.user.id,
      Buffer.from(svg, "utf-8"),
      "image/svg+xml",
      "tryon-variation"
    );

    return { imageUrls: [saved.url], provider: "mock" };
  }
}

function promptContext(input: TryOnGenerationInput): Omit<TryOnPromptContext, "view"> {
  return {
    user: input.user,
    profile: input.profile,
    product: input.product,
    selectedSize: input.selectedSize,
    selectedColor: input.selectedColor,
    userNotes: input.userNotes,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadImageBytes(url?: string | null): Promise<ImageBytes | null> {
  if (!url) return null;

  // Locally stored upload
  const storagePath = storagePathFromUrl(url);
  if (storagePath) {
    const file = await readStoredFile(storagePath);
    if (!file || file.data.length > 6_000_000) return null;
    return { data: file.data, mimeType: file.mimeType };
  }

  // Remote product image
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type")?.split(";")[0].trim() ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > 6_000_000) return null;
    return { data: buffer, mimeType: contentType };
  } catch {
    return null;
  }
}

async function loadImageAsDataUri(url?: string | null): Promise<string | null> {
  const image = await loadImageBytes(url);
  if (!image) return null;
  return `data:${image.mimeType};base64,${image.data.toString("base64")}`;
}

function renderMockSvg(opts: {
  view: string;
  productTitle: string;
  brand?: string | null;
  selectedSize?: string | null;
  referenceImage: string | null;
  productImage: string | null;
}): string {
  const title = escapeXml(truncate(opts.productTitle, 42));
  const brand = escapeXml(truncate(opts.brand ?? "", 28));
  const viewLabel = opts.view.charAt(0).toUpperCase() + opts.view.slice(1);
  const sizeLabel = opts.selectedSize ? `Size ${escapeXml(opts.selectedSize)}` : "";

  const userPanel = opts.referenceImage
    ? `<image href="${opts.referenceImage}" x="40" y="120" width="350" height="540" preserveAspectRatio="xMidYMid slice" clip-path="url(#leftClip)"/>`
    : `<rect x="40" y="120" width="350" height="540" rx="16" fill="#1c1c22"/>
       <text x="215" y="395" text-anchor="middle" fill="#8b8b96" font-size="18" font-family="system-ui">Your reference photo</text>`;

  const productPanel = opts.productImage
    ? `<image href="${opts.productImage}" x="410" y="120" width="350" height="540" preserveAspectRatio="xMidYMid slice" clip-path="url(#rightClip)"/>`
    : `<rect x="410" y="120" width="350" height="540" rx="16" fill="#1c1c22"/>
       <text x="585" y="395" text-anchor="middle" fill="#8b8b96" font-size="18" font-family="system-ui">Product image</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="760" viewBox="0 0 800 760">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0e0e12"/>
      <stop offset="100%" stop-color="#1a1424"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#a78bfa"/>
      <stop offset="100%" stop-color="#f0abfc"/>
    </linearGradient>
    <clipPath id="leftClip"><rect x="40" y="120" width="350" height="540" rx="16"/></clipPath>
    <clipPath id="rightClip"><rect x="410" y="120" width="350" height="540" rx="16"/></clipPath>
  </defs>
  <rect width="800" height="760" fill="url(#bg)"/>
  <text x="40" y="58" fill="url(#accent)" font-size="26" font-weight="700" font-family="system-ui">shAIpe</text>
  <text x="40" y="92" fill="#e7e7ee" font-size="17" font-family="system-ui">${viewLabel} view preview (mock) ${sizeLabel ? "&#183; " + sizeLabel : ""}</text>
  ${userPanel}
  ${productPanel}
  <text x="215" y="700" text-anchor="middle" fill="#a3a3af" font-size="14" font-family="system-ui">You</text>
  <text x="585" y="700" text-anchor="middle" fill="#a3a3af" font-size="14" font-family="system-ui">${brand ? brand + " &#183; " : ""}${title}</text>
  <text x="400" y="740" text-anchor="middle" fill="#6b6b76" font-size="12" font-family="system-ui">Mock preview &#8212; real AI try-on generation coming soon</text>
</svg>`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
