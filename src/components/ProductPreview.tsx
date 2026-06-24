"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ScrapedProduct } from "@/lib/validators";

export function ProductPreview({
  product,
  selectedImage,
  onSelectImage,
}: {
  product: ScrapedProduct;
  selectedImage?: string;
  onSelectImage?: (url: string) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            {product.brand && (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {product.brand}
              </p>
            )}
            <h3 className="font-semibold">{product.title}</h3>
          </div>
          {product.price && (
            <Badge variant="secondary">
              {product.currency ? `${product.currency} ` : ""}
              {product.price}
            </Badge>
          )}
        </div>

        {product.images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {product.images.slice(0, 6).map((img) => (
              <button
                key={img}
                type="button"
                onClick={() => onSelectImage?.(img)}
                className={`shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                  selectedImage === img ? "border-primary" : "border-transparent"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" className="h-28 w-20 object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-1 text-sm">
          {product.material && (
            <p>
              <span className="text-muted-foreground">Material:</span> {product.material}
            </p>
          )}
          {product.fitDescription && (
            <p>
              <span className="text-muted-foreground">Fit:</span> {product.fitDescription}
            </p>
          )}
          {product.availableSizes.length > 0 && (
            <p>
              <span className="text-muted-foreground">Sizes:</span>{" "}
              {product.availableSizes.join(", ")}
            </p>
          )}
          {product.description && (
            <p className="line-clamp-3 text-muted-foreground">{product.description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
