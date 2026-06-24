import { db, parseJsonArray, toJsonArray } from "@/lib/db";
import { getImageGenerationProvider } from "@/lib/imageGeneration";
import { getFitAnalysisProvider } from "@/lib/fitAnalysis";

/**
 * Runs try-on generation for an existing TryOn record (status should already
 * be "generating"). Designed to run in the background after the API response
 * is sent: images are written to the record as they complete so the results
 * page can poll and show progress, and fit analysis runs in parallel so it
 * appears as soon as it's ready.
 */
export async function runTryOnPipeline(tryOnId: string): Promise<void> {
  const tryOn = await db.tryOn.findUnique({
    where: { id: tryOnId },
    include: { product: true, user: { include: { profile: true } } },
  });
  if (!tryOn || !tryOn.product) {
    await markFailed(tryOnId);
    return;
  }

  const { product, user } = tryOn;
  const referenceImages = await db.userImage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  const productImages = parseJsonArray(product.images);
  const collectedImages: string[] = [];

  const generation = getImageGenerationProvider()
    .generateTryOn({
      user,
      profile: user.profile,
      referenceImages,
      product,
      productImageUrl: productImages[0],
      productImageUrls: productImages.slice(0, 3),
      selectedSize: tryOn.selectedSize,
      selectedColor: tryOn.selectedColor,
      userNotes: tryOn.userNotes,
      views: ["front", "side", "back"],
      onImage: async (url) => {
        collectedImages.push(url);
        await db.tryOn.update({
          where: { id: tryOnId },
          data: { generatedImages: toJsonArray(collectedImages) },
        });
      },
    })
    .then((result) => ({ ok: true as const, result }))
    .catch((error) => {
      console.error(`Try-on ${tryOnId} image generation failed:`, error);
      return { ok: false as const };
    });

  const fit = getFitAnalysisProvider()
    .analyze({
      profile: user.profile,
      product,
      selectedSize: tryOn.selectedSize,
    })
    .then(async (result) => {
      // Preserve warnings recorded at creation time (e.g. scrape failures).
      const existingWarnings = parseJsonArray(tryOn.fitWarnings);
      await db.tryOn.update({
        where: { id: tryOnId },
        data: {
          fitPrediction: result.predictedFit,
          recommendedSize: result.recommendedSize,
          confidence: result.confidence,
          fitExplanation: result.explanation,
          fitWarnings: toJsonArray([...(result.warnings ?? []), ...existingWarnings]),
        },
      });
      return true;
    })
    .catch((error) => {
      console.error(`Try-on ${tryOnId} fit analysis failed:`, error);
      return false;
    });

  const [generationOutcome] = await Promise.all([generation, fit]);

  if (!generationOutcome.ok) {
    await markFailed(tryOnId);
    return;
  }

  await db.tryOn.update({
    where: { id: tryOnId },
    data: {
      status: "completed",
      generatedImages: toJsonArray(generationOutcome.result.imageUrls),
    },
  });
}

/**
 * Generates a single variation image for a child TryOn record (one created
 * with parentId + variationPrompt, status "generating").
 */
export async function runVariationPipeline(variationId: string): Promise<void> {
  const variation = await db.tryOn.findUnique({
    where: { id: variationId },
    include: {
      product: true,
      user: { include: { profile: true } },
      parent: true,
    },
  });
  if (!variation || !variation.product || !variation.parent || !variation.variationPrompt) {
    await markFailed(variationId);
    return;
  }

  const baseImageUrl = parseJsonArray(variation.parent.generatedImages)[0];
  if (!baseImageUrl) {
    await markFailed(variationId);
    return;
  }

  try {
    const result = await getImageGenerationProvider().generateVariation({
      user: variation.user,
      product: variation.product,
      baseImageUrl,
      variationPrompt: variation.variationPrompt,
    });

    await db.tryOn.update({
      where: { id: variationId },
      data: {
        status: "completed",
        generatedImages: toJsonArray(result.imageUrls),
      },
    });
  } catch (error) {
    console.error(`Variation ${variationId} generation failed:`, error);
    await markFailed(variationId);
  }
}

async function markFailed(tryOnId: string): Promise<void> {
  await db.tryOn
    .update({ where: { id: tryOnId }, data: { status: "failed" } })
    .catch(() => {});
}

const outfitInclude = {
  outfitItems: {
    include: {
      closetItem: {
        include: {
          tryOn: { include: { product: true } },
        },
      },
    },
  },
} as const;

function resolveArtifactUrl(
  generatedImages: string[],
  productImages: string[]
): string | undefined {
  return generatedImages[0] ?? productImages[0];
}

/**
 * Generates an outfit try-on from multiple virtual-closet items.
 */
export async function runOutfitPipeline(tryOnId: string): Promise<void> {
  const tryOn = await db.tryOn.findUnique({
    where: { id: tryOnId },
    include: {
      user: { include: { profile: true } },
      ...outfitInclude,
    },
  });

  if (!tryOn || tryOn.kind !== "outfit" || tryOn.outfitItems.length < 2) {
    await markFailed(tryOnId);
    return;
  }

  const referenceImages = await db.userImage.findMany({
    where: { userId: tryOn.userId },
    orderBy: { createdAt: "asc" },
  });

  const outfitItemsInput = [];
  for (const link of tryOn.outfitItems) {
    const source = link.closetItem.tryOn;
    const product = source.product;
    if (!product) {
      await markFailed(tryOnId);
      return;
    }
    const generatedImages = parseJsonArray(source.generatedImages);
    const productImages = parseJsonArray(product.images);
    const artifactImageUrl = resolveArtifactUrl(generatedImages, productImages);
    if (!artifactImageUrl) {
      await markFailed(tryOnId);
      return;
    }
    outfitItemsInput.push({
      product,
      artifactImageUrl,
      selectedSize: source.selectedSize,
      selectedColor: source.selectedColor,
    });
  }

  const collectedImages: string[] = [];

  try {
    const result = await getImageGenerationProvider().generateOutfit({
      user: tryOn.user,
      profile: tryOn.user.profile,
      referenceImages,
      items: outfitItemsInput,
      userNotes: tryOn.userNotes,
      views: ["front"],
      onImage: async (url) => {
        collectedImages.push(url);
        await db.tryOn.update({
          where: { id: tryOnId },
          data: { generatedImages: toJsonArray(collectedImages) },
        });
      },
    });

    await db.tryOn.update({
      where: { id: tryOnId },
      data: {
        status: "completed",
        generatedImages: toJsonArray(result.imageUrls),
      },
    });
  } catch (error) {
    console.error(`Outfit ${tryOnId} generation failed:`, error);
    await markFailed(tryOnId);
  }
}
