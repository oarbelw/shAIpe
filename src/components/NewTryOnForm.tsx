"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductUrlInput } from "@/components/ProductUrlInput";
import { ProductImageUploader } from "@/components/ProductImageUploader";
import { ProductPreview } from "@/components/ProductPreview";
import type { ScrapedProduct } from "@/lib/validators";

export function NewTryOnForm() {
  const router = useRouter();

  const [mode, setMode] = useState<"url" | "image">("url");

  // URL mode
  const [scraped, setScraped] = useState<ScrapedProduct | null>(null);
  const [productUrl, setProductUrl] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | undefined>();

  // Image mode
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualBrand, setManualBrand] = useState("");
  const [manualMaterial, setManualMaterial] = useState("");

  // Shared
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = mode === "url" ? !!scraped : !!uploadedImageUrl;

  async function handleGenerate() {
    setSubmitting(true);
    setError(null);

    const body =
      mode === "url"
        ? {
            productUrl: productUrl ?? undefined,
            productImageUrl: selectedImage,
            selectedSize: selectedSize || undefined,
            selectedColor: selectedColor || undefined,
            notes: notes || undefined,
          }
        : {
            productImageUrl: uploadedImageUrl ?? undefined,
            productTitle: manualTitle || undefined,
            productBrand: manualBrand || undefined,
            productMaterial: manualMaterial || undefined,
            selectedSize: selectedSize || undefined,
            selectedColor: selectedColor || undefined,
            notes: notes || undefined,
          };

    const res = await fetch("/api/try-on", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "Could not create try-on");
      setSubmitting(false);
      return;
    }

    router.push(`/try-on/${data.tryOn.id}`);
  }

  const scrapedSizes = scraped?.availableSizes ?? [];
  const scrapedColors = scraped?.colors ?? [];

  return (
    <div className="space-y-6">
      <Tabs value={mode} onValueChange={(v) => setMode(v as "url" | "image")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="url">Paste product URL</TabsTrigger>
          <TabsTrigger value="image">Upload clothing image</TabsTrigger>
        </TabsList>

        <TabsContent value="url" className="space-y-4 pt-4">
          <ProductUrlInput
            onScraped={(product, url) => {
              setScraped(product);
              setProductUrl(url);
              setSelectedImage(product.images[0]);
            }}
          />
          {scraped && (
            <ProductPreview
              product={scraped}
              selectedImage={selectedImage}
              onSelectImage={setSelectedImage}
            />
          )}
        </TabsContent>

        <TabsContent value="image" className="space-y-4 pt-4">
          <ProductImageUploader imageUrl={uploadedImageUrl} onUploaded={setUploadedImageUrl} />
          {uploadedImageUrl && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="manual-title">Product name (optional)</Label>
                <Input
                  id="manual-title"
                  placeholder="Ribbed knit midi dress"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-brand">Brand (optional)</Label>
                <Input
                  id="manual-brand"
                  placeholder="Aritzia"
                  value={manualBrand}
                  onChange={(e) => setManualBrand(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-material">Material (optional)</Label>
                <Input
                  id="manual-material"
                  placeholder="95% cotton, 5% elastane"
                  value={manualMaterial}
                  onChange={(e) => setManualMaterial(e.target.value)}
                />
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {ready && (
        <div className="space-y-4 rounded-lg border p-4">
          <h3 className="font-semibold">Options</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Size you&apos;re considering</Label>
              {scrapedSizes.length > 0 && mode === "url" ? (
                <Select value={selectedSize} onValueChange={setSelectedSize}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a size" />
                  </SelectTrigger>
                  <SelectContent>
                    {scrapedSizes.map((size) => (
                      <SelectItem key={size} value={size}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="e.g. S, M, 27"
                  value={selectedSize}
                  onChange={(e) => setSelectedSize(e.target.value)}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              {scrapedColors.length > 0 && mode === "url" ? (
                <Select value={selectedColor} onValueChange={setSelectedColor}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a color" />
                  </SelectTrigger>
                  <SelectContent>
                    {scrapedColors.map((color) => (
                      <SelectItem key={color} value={color}>
                        {color}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="e.g. Black"
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value)}
                />
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="e.g. I want to see if this looks flattering for a dinner outfit"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        size="lg"
        className="w-full"
        disabled={!ready || submitting}
        onClick={handleGenerate}
      >
        {submitting ? "Starting your try-on…" : "Generate try-on"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Generation takes about a minute — you&apos;ll watch your preview appear live.
      </p>
    </div>
  );
}
