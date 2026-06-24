import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db, toJsonArray } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { tryOnRequestSchema, type ScrapedProduct } from "@/lib/validators";
import { scrapeProduct, ScrapeError } from "@/lib/scraper";
import { runTryOnPipeline } from "@/lib/tryOnPipeline";
import { serializeTryOn } from "@/lib/serializers";
import { handleApiError } from "@/lib/apiHelpers";

/**
 * Creates a try-on. Scraping happens synchronously (so URL problems surface
 * immediately), then the record is returned with status "generating" while
 * image generation + fit analysis run in the background. The results page
 * polls GET /api/try-on/:id for progress.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const input = tryOnRequestSchema.parse(await req.json());

    const referenceCount = await db.userImage.count({ where: { userId: user.id } });
    if (referenceCount === 0) {
      return NextResponse.json(
        { error: "Upload at least one reference photo of yourself before creating a try-on." },
        { status: 400 }
      );
    }

    // 1. Scrape product page when a URL is provided.
    let scraped: ScrapedProduct | null = null;
    let scrapeWarning: string | undefined;
    if (input.productUrl) {
      try {
        scraped = await scrapeProduct(input.productUrl);
      } catch (error) {
        if (!(error instanceof ScrapeError)) throw error;
        if (!input.productImageUrl) {
          return NextResponse.json(
            { error: `${error.message} Try uploading a product image instead.` },
            { status: 422 }
          );
        }
        scrapeWarning =
          "We couldn't read the product page, so this preview uses your uploaded image only.";
      }
    }

    // 2. Store product metadata (scraped + manual fields, manual wins).
    const productImages = [
      ...(input.productImageUrl ? [input.productImageUrl] : []),
      ...(scraped?.images ?? []),
    ];
    const product = await db.product.create({
      data: {
        url: input.productUrl,
        title: input.productTitle || scraped?.title || "Untitled product",
        brand: input.productBrand || scraped?.brand,
        price: scraped?.price,
        currency: scraped?.currency,
        description: scraped?.description,
        category: scraped?.category,
        images: toJsonArray(productImages),
        availableSizes: toJsonArray(scraped?.availableSizes),
        colors: toJsonArray(scraped?.colors),
        material: input.productMaterial || scraped?.material,
        fitDescription: scraped?.fitDescription,
        modelInfo: scraped?.modelInfo,
        reviewsSummary: scraped?.reviewsSummary,
        rawScrapedText: scraped?.rawScrapedText,
      },
    });

    // 3. Create the try-on record and kick off background generation.
    const tryOn = await db.tryOn.create({
      data: {
        userId: user.id,
        productId: product.id,
        selectedSize: input.selectedSize,
        selectedColor: input.selectedColor,
        userNotes: input.notes,
        status: "generating",
        fitWarnings: toJsonArray(scrapeWarning ? [scrapeWarning] : []),
      },
      include: { product: true },
    });

    after(() => runTryOnPipeline(tryOn.id));

    return NextResponse.json({ tryOn: serializeTryOn(tryOn) });
  } catch (error) {
    return handleApiError(error);
  }
}
