import type { Product, TryOn, ClosetItem, OutfitTryOnItem } from "@prisma/client";
import { parseJsonArray } from "@/lib/db";

export function serializeProduct(product: Product) {
  return {
    ...product,
    images: parseJsonArray(product.images),
    availableSizes: parseJsonArray(product.availableSizes),
    colors: parseJsonArray(product.colors),
  };
}

type OutfitItemWithCloset = OutfitTryOnItem & {
  closetItem: ClosetItem & {
    tryOn: TryOn & { product: Product | null };
  };
};

export function serializeClosetItem(
  item: ClosetItem & { tryOn: TryOn & { product: Product | null } }
) {
  const generatedImages = parseJsonArray(item.tryOn.generatedImages);
  const productImages = item.tryOn.product
    ? parseJsonArray(item.tryOn.product.images)
    : [];
  return {
    ...item,
    thumbnailUrl: generatedImages[0] ?? productImages[0] ?? null,
    tryOn: {
      ...item.tryOn,
      generatedImages,
      fitWarnings: parseJsonArray(item.tryOn.fitWarnings),
      product: item.tryOn.product ? serializeProduct(item.tryOn.product) : null,
    },
  };
}

export function serializeOutfitItem(link: OutfitItemWithCloset) {
  return {
    id: link.id,
    closetItem: serializeClosetItem(link.closetItem),
  };
}

export function serializeTryOn(
  tryOn: TryOn & {
    product?: Product | null;
    variations?: TryOn[];
    outfitItems?: OutfitItemWithCloset[];
  }
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
    outfitItems: (tryOn.outfitItems ?? []).map(serializeOutfitItem),
  };
}

export function outfitDisplayTitle(
  tryOn: Pick<SerializedTryOn, "kind" | "product" | "outfitItems">
): string {
  if (tryOn.kind === "outfit" && tryOn.outfitItems.length > 0) {
    return tryOn.outfitItems
      .map((item) => item.closetItem.tryOn.product?.title ?? item.closetItem.label ?? "Item")
      .join(" + ");
  }
  return tryOn.product?.title ?? "Try-on";
}

export type SerializedProduct = ReturnType<typeof serializeProduct>;
export type SerializedClosetItem = ReturnType<typeof serializeClosetItem>;
export type SerializedTryOn = ReturnType<typeof serializeTryOn>;
export type SerializedVariation = SerializedTryOn["variations"][number];
export type SerializedOutfitItem = SerializedTryOn["outfitItems"][number];
