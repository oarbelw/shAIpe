import { readStoredFile, saveFile, storagePathFromUrl } from "@/lib/storage";
import { buildTryOnPrompt, buildOutfitPrompt, type TryOnPromptContext } from "@/lib/promptBuilder";
import { analyzeProductVisual, type ProductVisualSpec } from "@/lib/productVisualAnalysis";
import { pickBestProductReferenceImage } from "@/lib/productImageSelection";
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
  /** Up to 3 reference photos of the product for better fidelity. */
  productImageUrls?: string[];
  visualSpec?: ProductVisualSpec | null;
  selectedSize?: string | null;
  selectedColor?: string | null;
  userNotes?: string | null;
  views: Array<"front" | "back">;
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

export type OutfitItemInput = {
  product: Product;
  artifactImageUrl: string;
  selectedSize?: string | null;
  selectedColor?: string | null;
};

export type OutfitGenerationInput = {
  user: User;
  profile: UserProfile | null;
  referenceImages: UserImage[];
  items: OutfitItemInput[];
  userNotes?: string | null;
  views: Array<"front" | "back">;
  onImage?: (url: string) => Promise<void> | void;
};

export interface ImageGenerationProvider {
  generateTryOn(input: TryOnGenerationInput): Promise<TryOnGenerationResult>;
  generateVariation(input: VariationGenerationInput): Promise<TryOnGenerationResult>;
  generateOutfit(input: OutfitGenerationInput): Promise<TryOnGenerationResult>;
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

    const allProductUrls = dedupeUrls([
      ...(input.productImageUrls ?? []),
      ...(input.productImageUrl ? [input.productImageUrl] : []),
    ]);

    // Use the clearest product photo as the primary reference, but also pass
    // additional angles (e.g. a back shot) so the garment matches every view.
    const bestProductUrl = await pickBestProductReferenceImage(input.product, allProductUrls);
    const orderedProductUrls = dedupeUrls([
      ...(bestProductUrl ? [bestProductUrl] : []),
      ...allProductUrls,
    ]).slice(0, 3);
    const productImages: ImageBytes[] = [];
    for (const url of orderedProductUrls) {
      const bytes = await loadImageBytes(url);
      if (bytes) productImages.push(bytes);
    }

    const visualSpec =
      input.visualSpec ??
      (bestProductUrl ? await analyzeProductVisual(input.product, bestProductUrl) : null);

    // Load ALL of the user's reference photos once. Passing every angle to each
    // generation gives the model the strongest possible identity signal so the
    // result is unmistakably the same person.
    const loadedReferences = (
      await Promise.all(
        input.referenceImages.map(async (img) => ({
          angle: img.angle,
          bytes: await loadImageBytes(img.imageUrl),
        }))
      )
    ).filter((r): r is { angle: string; bytes: ImageBytes } => Boolean(r.bytes));

    const imageUrls: string[] = [];
    let lastError: unknown;

    for (const view of input.views) {
      // Put the photo matching this view first, then the rest ordered by how
      // useful they are for identity (face close-up first, then front).
      const matching = loadedReferences.filter((r) => r.angle === view);
      const others = loadedReferences
        .filter((r) => r.angle !== view)
        .sort((a, b) => referenceAnglePriority(a.angle) - referenceAnglePriority(b.angle));
      const orderedRefs = [...matching, ...others];
      if (orderedRefs.length === 0) continue;

      const prompt = buildTryOnPrompt({ ...promptContext(input), view, visualSpec });

      const parts: Array<
        { text: string } | { inlineData: { data: string; mimeType: string } }
      > = [{ text: prompt }];

      if (productImages.length > 0) {
        parts.push({
          text:
            productImages.length === 1
              ? "PRODUCT REFERENCE PHOTO — the ONLY source of truth for the garment. Copy its exact fabric color, printed graphics/logos on the fabric, trim, cut, and construction. Do NOT copy any website/marketing text:"
              : "PRODUCT REFERENCE PHOTOS — these show the SAME garment from multiple angles and are the ONLY source of truth for it. Copy its exact fabric color, printed graphics/logos, trim, cut, and construction; use whichever angle matches this view. Do NOT copy any website/marketing text:",
        });
        for (const img of productImages) {
          parts.push({
            inlineData: { data: img.data.toString("base64"), mimeType: img.mimeType },
          });
        }
      }

      parts.push({
        text:
          orderedRefs.length === 1
            ? "USER REFERENCE PHOTO — this is the exact, specific real person to render. Preserve their identity perfectly (face, body, skin tone, hair) and dress THEM in the product shown above:"
            : "USER REFERENCE PHOTOS — these are the SAME specific real person from multiple angles. Preserve their exact identity (face, body, skin tone, hair) and dress THEM in the product shown above:",
      });
      for (const ref of orderedRefs) {
        parts.push({
          inlineData: { data: ref.bytes.data.toString("base64"), mimeType: ref.bytes.mimeType },
        });
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

  async generateOutfit(input: OutfitGenerationInput): Promise<TryOnGenerationResult> {
    const client = getGeminiClient();
    if (!client) throw new Error("Gemini client not configured");

    const loadedReferences = (
      await Promise.all(
        input.referenceImages.map(async (img) => ({
          angle: img.angle,
          bytes: await loadImageBytes(img.imageUrl),
        }))
      )
    ).filter((r): r is { angle: string; bytes: ImageBytes } => Boolean(r.bytes));

    const imageUrls: string[] = [];
    let lastError: unknown;

    for (const view of input.views) {
      const matching = loadedReferences.filter((r) => r.angle === view);
      const others = loadedReferences
        .filter((r) => r.angle !== view)
        .sort((a, b) => referenceAnglePriority(a.angle) - referenceAnglePriority(b.angle));
      const orderedRefs = [...matching, ...others];
      if (orderedRefs.length === 0) continue;

      const prompt = buildOutfitPrompt({
        user: input.user,
        profile: input.profile,
        items: input.items.map((item) => ({
          product: item.product,
          selectedSize: item.selectedSize,
          selectedColor: item.selectedColor,
        })),
        userNotes: input.userNotes,
        view,
      });

      const parts: Array<
        { text: string } | { inlineData: { data: string; mimeType: string } }
      > = [
        { text: prompt },
        {
          text:
            orderedRefs.length === 1
              ? "USER REFERENCE PHOTO — the exact person to render. Preserve their identity perfectly:"
              : "USER REFERENCE PHOTOS — the SAME person from multiple angles. Preserve their exact identity:",
        },
      ];
      for (const ref of orderedRefs) {
        parts.push({
          inlineData: { data: ref.bytes.data.toString("base64"), mimeType: ref.bytes.mimeType },
        });
      }

      for (let i = 0; i < input.items.length; i++) {
        const item = input.items[i];
        const artifact = await loadImageBytes(item.artifactImageUrl);
        const label = `${item.product.brand ? item.product.brand + " " : ""}${item.product.title}`;
        parts.push({ text: `Clothing item ${i + 1} (${label}) — reference from previous try-on:` });
        if (artifact) {
          parts.push({
            inlineData: {
              data: artifact.data.toString("base64"),
              mimeType: artifact.mimeType,
            },
          });
        }
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
          lastError = new Error(`Gemini returned no image for outfit ${view} view`);
          console.error(lastError);
          continue;
        }

        const saved = await saveFile(
          input.user.id,
          Buffer.from(generated.data, "base64"),
          generated.mimeType,
          `outfit-${view}`
        );
        imageUrls.push(saved.url);
        await input.onImage?.(saved.url);
      } catch (error) {
        lastError = error;
        console.error(`Gemini outfit generation failed for ${view} view:`, error);
      }
    }

    if (imageUrls.length === 0) {
      throw lastError instanceof Error
        ? lastError
        : new Error("Gemini outfit generation produced no images");
    }

    return { imageUrls, provider: `gemini:${GEMINI_IMAGE_MODEL}` };
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

  async generateOutfit(input: OutfitGenerationInput): Promise<TryOnGenerationResult> {
    const imageUrls: string[] = [];
    const titles = input.items.map((i) => i.product.title).join(" + ");

    for (const view of input.views) {
      buildOutfitPrompt({
        user: input.user,
        profile: input.profile,
        items: input.items.map((item) => ({
          product: item.product,
          selectedSize: item.selectedSize,
          selectedColor: item.selectedColor,
        })),
        userNotes: input.userNotes,
        view,
      });

      const reference =
        input.referenceImages.find((img) => img.angle === view) ??
        input.referenceImages.find((img) => img.angle === "front") ??
        input.referenceImages[0];

      const referenceImage = reference
        ? await loadImageAsDataUri(reference.imageUrl)
        : null;

      const firstArtifact = input.items[0]
        ? await loadImageAsDataUri(input.items[0].artifactImageUrl)
        : null;

      const svg = renderMockSvg({
        view,
        productTitle: `Outfit: ${titles}`,
        brand: `${input.items.length} items`,
        selectedSize: null,
        referenceImage,
        productImage: firstArtifact,
      });

      const saved = await saveFile(
        input.user.id,
        Buffer.from(svg, "utf-8"),
        "image/svg+xml",
        `outfit-${view}`
      );
      imageUrls.push(saved.url);
      await input.onImage?.(saved.url);
    }

    return { imageUrls, provider: "mock" };
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

/** Lower = more useful for preserving identity when it's not the matching view. */
function referenceAnglePriority(angle: string): number {
  switch (angle) {
    case "face":
      return 0;
    case "front":
      return 1;
    case "back":
      return 2;
    case "other":
      return 3;
    default:
      return 4;
  }
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const trimmed = url.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

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
