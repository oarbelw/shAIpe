"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FitAnalysisCard } from "@/components/FitAnalysisCard";
import { AddToClosetButton } from "@/components/AddToClosetButton";
import { outfitDisplayTitle, type SerializedTryOn, type SerializedVariation } from "@/lib/serializers";

const SINGLE_VIEW_LABELS = ["Front view", "Back view"];
const OUTFIT_VIEW_LABELS = ["Front view"];
const POLL_INTERVAL_MS = 2500;
const SLOW_THRESHOLD_S = 180;

const REMIX_IDEAS = [
  "Make it red",
  "Make it black",
  "Make it white",
  "Pair it with blue jeans",
  "Pair it with a black skirt",
  "Tucked in",
  "Make it oversized",
  "Add a denim jacket over it",
];

export function TryOnResult({ tryOn: initialTryOn }: { tryOn: SerializedTryOn }) {
  const router = useRouter();
  const [tryOn, setTryOn] = useState(initialTryOn);
  const [elapsed, setElapsed] = useState(0);
  const [remixPrompt, setRemixPrompt] = useState("");
  const [remixError, setRemixError] = useState<string | null>(null);
  const [remixSubmitting, setRemixSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const tryOnRef = useRef(tryOn);
  useEffect(() => {
    tryOnRef.current = tryOn;
  }, [tryOn]);

  const isGenerating =
    tryOn.status === "generating" ||
    tryOn.variations.some((v) => v.status === "generating");

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/try-on/${tryOnRef.current.id}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (data?.tryOn) setTryOn(data.tryOn);
  }, []);

  // Poll while anything is generating so images and fit analysis stream in.
  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [isGenerating, refresh]);

  async function retry(id: string) {
    setElapsed(0);
    const res = await fetch(`/api/try-on/${id}/retry`, { method: "POST" });
    if (res.ok) await refresh();
  }

  async function submitRemix(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || remixSubmitting) return;
    setRemixSubmitting(true);
    setRemixError(null);

    const res = await fetch(`/api/try-on/${tryOn.id}/variation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: trimmed }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setRemixError(data.error ?? "Could not start the variation");
    } else {
      setRemixPrompt("");
      await refresh();
    }
    setRemixSubmitting(false);
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/try-on/${tryOn.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/try-ons");
      router.refresh();
    } else {
      setDeleting(false);
    }
  }

  const product = tryOn.product;
  const productImage = product?.images[0];
  const isOutfit = tryOn.kind === "outfit";
  const viewLabels = isOutfit ? OUTFIT_VIEW_LABELS : SINGLE_VIEW_LABELS;
  const totalViews = viewLabels.length;
  const imagesDone = tryOn.generatedImages.length;
  const showRemix = tryOn.status === "completed" && !tryOn.parentId && !isOutfit;
  const showCloset = tryOn.status === "completed" && !tryOn.parentId && !isOutfit;
  const pageTitle = isOutfit ? outfitDisplayTitle(tryOn) : "Your try-on preview";

  return (
    <div className="space-y-6">
      {/* Generated images */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">
              {isOutfit ? "Your outfit preview" : pageTitle}
            </h2>
            {isOutfit && (
              <p className="text-sm text-muted-foreground">{outfitDisplayTitle(tryOn)}</p>
            )}
          </div>
          {tryOn.status === "generating" && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Generating image {Math.min(imagesDone + 1, totalViews)} of {totalViews}…
            </span>
          )}
        </div>

        {tryOn.status === "failed" ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-destructive">
                This try-on failed to generate. This sometimes happens when the AI is busy.
              </p>
              <Button onClick={() => retry(tryOn.id)}>Try again</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className={`grid gap-4 ${isOutfit ? "max-w-md" : "sm:grid-cols-2"}`}>
              {Array.from({ length: totalViews }).map((_, i) => {
                const url = tryOn.generatedImages[i];
                return (
                  <div key={i} className="space-y-2">
                    {url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={url}
                        alt={viewLabels[i] ?? `Generated view ${i + 1}`}
                        className="aspect-[3/4] w-full rounded-lg border object-cover"
                      />
                    ) : (
                      <div className="relative">
                        <Skeleton className="aspect-[3/4] w-full rounded-lg" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                          <Loader2 className="size-5 animate-spin" />
                          <span className="text-xs">
                            {i === imagesDone ? "Generating…" : "Waiting…"}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {viewLabels[i] ?? `View ${i + 1}`}
                      </span>
                      {url && (
                        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                          <a href={url} download>
                            Download
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {tryOn.status === "generating" && (
              <p className="mt-3 text-xs text-muted-foreground">
                This usually takes about a minute. You can leave this page — your try-on will
                keep generating and will be waiting in{" "}
                <Link href="/try-ons" className="underline underline-offset-4">
                  My try-ons
                </Link>
                .
                {elapsed > SLOW_THRESHOLD_S && (
                  <>
                    {" "}
                    Taking longer than expected?{" "}
                    <button
                      type="button"
                      onClick={() => retry(tryOn.id)}
                      className="underline underline-offset-4"
                    >
                      Restart generation
                    </button>
                    .
                  </>
                )}
              </p>
            )}
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {isOutfit && tryOn.outfitItems.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Outfit items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tryOn.outfitItems.map((link) => {
                  const closet = link.closetItem;
                  const itemProduct = closet.tryOn.product;
                  const thumb = closet.thumbnailUrl;
                  return (
                    <div key={link.id} className="flex gap-3 rounded-lg border p-3">
                      {thumb && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={thumb}
                          alt={itemProduct?.title ?? "Closet item"}
                          className="h-24 w-20 shrink-0 rounded-md border object-cover"
                        />
                      )}
                      <div className="min-w-0 space-y-1 text-sm">
                        {itemProduct?.brand && (
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            {itemProduct.brand}
                          </p>
                        )}
                        <p className="font-medium">{closet.label ?? itemProduct?.title ?? "Item"}</p>
                        <div className="flex flex-wrap gap-1">
                          {closet.tryOn.selectedSize && (
                            <Badge variant="outline" className="text-[10px]">
                              Size {closet.tryOn.selectedSize}
                            </Badge>
                          )}
                          {closet.tryOn.selectedColor && (
                            <Badge variant="outline" className="text-[10px]">
                              {closet.tryOn.selectedColor}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Product details */}
        {product && !isOutfit && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Product</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-4">
              {productImage && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={productImage}
                  alt={product.title}
                  className="h-40 w-28 shrink-0 rounded-md border object-cover"
                />
              )}
              <div className="space-y-2 text-sm">
                {product.brand && (
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {product.brand}
                  </p>
                )}
                <p className="font-semibold">{product.title}</p>
                <div className="flex flex-wrap gap-2">
                  {tryOn.selectedSize && <Badge variant="outline">Size {tryOn.selectedSize}</Badge>}
                  {tryOn.selectedColor && <Badge variant="outline">{tryOn.selectedColor}</Badge>}
                  {product.price && (
                    <Badge variant="secondary">
                      {product.currency ? `${product.currency} ` : ""}
                      {product.price}
                    </Badge>
                  )}
                </div>
                {product.material && (
                  <p>
                    <span className="text-muted-foreground">Material:</span> {product.material}
                  </p>
                )}
                {product.url && (
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-sm text-primary underline underline-offset-4"
                  >
                    View on retailer site
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Fit analysis (streams in while images generate) */}
        {!isOutfit &&
          (tryOn.fitPrediction || tryOn.fitExplanation ? (
          <FitAnalysisCard
            fitPrediction={tryOn.fitPrediction}
            recommendedSize={tryOn.recommendedSize}
            confidence={tryOn.confidence}
            explanation={tryOn.fitExplanation}
            warnings={tryOn.fitWarnings}
          />
        ) : tryOn.status === "generating" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Fit analysis
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <p className="text-xs text-muted-foreground">
                Analyzing sizing, material, and fit details…
              </p>
            </CardContent>
          </Card>
        ) : null)}
      </div>

      {tryOn.userNotes && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Your notes:</span> {tryOn.userNotes}
        </p>
      )}

      {showCloset && <AddToClosetButton tryOnId={tryOn.id} />}

      {/* Remix / variations */}
      {showRemix && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4" />
              Remix this look
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Want to see it a little different? Try a color change, different bottoms, or a
              styling tweak — anything you can describe.
            </p>

            <div className="flex flex-wrap gap-2">
              {REMIX_IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  disabled={remixSubmitting}
                  onClick={() => submitRemix(idea)}
                  className="rounded-full border px-3 py-1 text-xs transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {idea}
                </button>
              ))}
            </div>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submitRemix(remixPrompt);
              }}
            >
              <Input
                placeholder='e.g. "What would this look like in emerald green?"'
                value={remixPrompt}
                onChange={(e) => setRemixPrompt(e.target.value)}
                maxLength={300}
              />
              <Button type="submit" disabled={remixSubmitting || remixPrompt.trim().length < 3}>
                {remixSubmitting ? "Starting…" : "Generate"}
              </Button>
            </form>
            {remixError && <p className="text-sm text-destructive">{remixError}</p>}

            {tryOn.variations.length > 0 && (
              <div className="grid gap-4 pt-2 sm:grid-cols-3">
                {tryOn.variations.map((variation) => (
                  <VariationCard key={variation.id} variation={variation} onRetry={retry} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {isOutfit ? (
          <Button asChild>
            <Link href="/fitting-room">Back to fitting room</Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href="/try-on/new">Try on something else</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href="/try-ons">View all try-ons</Link>
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" className="text-destructive hover:text-destructive">
              Delete try-on
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this try-on?</DialogTitle>
              <DialogDescription>
                This removes the generated images{tryOn.variations.length > 0 ? ", all remixes," : ""}{" "}
                and the fit analysis. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Yes, delete it"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function VariationCard({
  variation,
  onRetry,
}: {
  variation: SerializedVariation;
  onRetry: (id: string) => void;
}) {
  const image = variation.generatedImages[0];

  return (
    <div className="space-y-2">
      {variation.status === "completed" && image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={image}
          alt={variation.variationPrompt ?? "Variation"}
          className="aspect-[3/4] w-full rounded-lg border object-cover"
        />
      ) : variation.status === "failed" ? (
        <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-center">
          <p className="text-xs text-destructive">Failed to generate</p>
          <Button size="sm" variant="outline" onClick={() => onRetry(variation.id)}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Skeleton className="aspect-[3/4] w-full rounded-lg" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-xs">Generating…</span>
          </div>
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-xs text-muted-foreground">
          “{variation.variationPrompt}”
        </p>
        {variation.status === "completed" && image && (
          <Button asChild variant="ghost" size="sm" className="h-6 shrink-0 px-2 text-xs">
            <a href={image} download>
              Download
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
