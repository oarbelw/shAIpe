import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { SerializedTryOn } from "@/lib/serializers";

const FIT_LABELS: Record<string, string> = {
  too_small: "Too small",
  tight: "Tight",
  true_to_size: "True to size",
  relaxed: "Relaxed",
  too_large: "Too large",
};

export function TryOnHistoryGrid({ tryOns }: { tryOns: SerializedTryOn[] }) {
  if (tryOns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">No try-ons yet.</p>
        <Link
          href="/try-on/new"
          className="mt-2 inline-block text-sm text-primary underline underline-offset-4"
        >
          Create your first try-on
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tryOns.map((tryOn) => {
        const cover = tryOn.generatedImages[0] ?? tryOn.product?.images[0];
        return (
          <Link
            key={tryOn.id}
            href={`/try-on/${tryOn.id}`}
            className="group overflow-hidden rounded-lg border transition-shadow hover:shadow-md"
          >
            <div className="aspect-[4/5] overflow-hidden bg-muted">
              {cover ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={cover}
                  alt={tryOn.product?.title ?? "Try-on"}
                  className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No preview
                </div>
              )}
            </div>
            <div className="space-y-1 p-3">
              <p className="truncate text-sm font-medium">
                {tryOn.product?.title ?? "Untitled product"}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {tryOn.product?.brand && (
                  <span className="text-xs text-muted-foreground">{tryOn.product.brand}</span>
                )}
                {tryOn.fitPrediction && (
                  <Badge variant="outline" className="text-[10px]">
                    {FIT_LABELS[tryOn.fitPrediction] ?? tryOn.fitPrediction}
                  </Badge>
                )}
                {tryOn.status !== "completed" && (
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {tryOn.status}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(tryOn.createdAt).toLocaleDateString()}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
