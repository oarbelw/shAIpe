import type { Product, TryOn } from "@prisma/client";
import { parseJsonArray } from "@/lib/db";

export function serializeProduct(product: Product) {
  return {
    ...product,
    images: parseJsonArray(product.images),
    availableSizes: parseJsonArray(product.availableSizes),
    colors: parseJsonArray(product.colors),
  };
}

export function serializeTryOn(
  tryOn: TryOn & { product?: Product | null; variations?: TryOn[] }
) {
  return {
    ...tryOn,
    generatedImages: parseJsonArray(tryOn.generatedImages),
    fitWarnings: parseJsonArray(tryOn.fitWarnings),
    product: tryOn.product ? serializeProduct(tryOn.product) : null,
    variations: (tryOn.variations ?? []).map((v) => ({
      ...v,
      generatedImages: parseJsonArray(v.generatedImages),
      fitWarnings: parseJsonArray(v.fitWarnings),
    })),
  };
}

export type SerializedProduct = ReturnType<typeof serializeProduct>;
export type SerializedTryOn = ReturnType<typeof serializeTryOn>;
export type SerializedVariation = SerializedTryOn["variations"][number];
