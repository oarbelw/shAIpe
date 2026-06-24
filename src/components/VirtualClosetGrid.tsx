"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SerializedClosetItem } from "@/lib/serializers";

export function VirtualClosetGrid({ initialItems }: { initialItems: SerializedClosetItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function removeItem(id: string) {
    setRemovingId(id);
    setError(null);
    const res = await fetch(`/api/closet/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not remove item");
    } else {
      setItems((prev) => prev.filter((item) => item.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    setRemovingId(null);
  }

  async function tryOnOutfit() {
    if (selected.size < 2 || submitting) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/fitting-room/outfit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        closetItemIds: [...selected],
        notes: notes.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "Could not start outfit try-on");
      setSubmitting(false);
      return;
    }

    router.push(`/try-on/${data.tryOn.id}`);
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Your virtual closet is empty. Complete a try-on, then tap{" "}
          <span className="font-medium text-foreground">Add to virtual closet</span> on the
          results page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28">
      <p className="text-sm text-muted-foreground">
        Select two or more items you have already tried on to see them combined as one outfit.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const product = item.tryOn.product;
          const isSelected = selected.has(item.id);
          const title = item.label ?? product?.title ?? "Closet item";

          return (
            <div
              key={item.id}
              className={`relative overflow-hidden rounded-lg border transition-shadow ${
                isSelected ? "ring-2 ring-primary" : "hover:shadow-md"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleSelected(item.id)}
                className="block w-full text-left"
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-muted">
                  {item.thumbnailUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.thumbnailUrl}
                      alt={title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No preview
                    </div>
                  )}
                  {isSelected && (
                    <div className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-4" />
                    </div>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm font-medium">{title}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {product?.brand && (
                      <span className="text-xs text-muted-foreground">{product.brand}</span>
                    )}
                    {item.tryOn.selectedSize && (
                      <Badge variant="outline" className="text-[10px]">
                        Size {item.tryOn.selectedSize}
                      </Badge>
                    )}
                    {item.tryOn.selectedColor && (
                      <Badge variant="outline" className="text-[10px]">
                        {item.tryOn.selectedColor}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute bottom-3 right-3 h-8 text-muted-foreground hover:text-destructive"
                disabled={removingId === item.id}
                onClick={(e) => {
                  e.stopPropagation();
                  removeItem(item.id);
                }}
              >
                {removingId === item.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="outfit-notes" className="mb-1 block text-xs text-muted-foreground">
              Styling notes (optional)
            </label>
            <Textarea
              id="outfit-notes"
              placeholder='e.g. "Tuck the shirt in" or "Casual weekend look"'
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={1000}
            />
          </div>
          <Button
            size="lg"
            disabled={selected.size < 2 || submitting}
            onClick={tryOnOutfit}
            className="shrink-0"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Starting…
              </>
            ) : (
              `Try on outfit (${selected.size} item${selected.size === 1 ? "" : "s"})`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
