"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shirt, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AddToClosetButton({ tryOnId }: { tryOnId: string }) {
  const [closetItemId, setClosetItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/closet/by-try-on/${tryOnId}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!cancelled && res.ok) {
        setClosetItemId(data.closetItemId ?? null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tryOnId]);

  async function addToCloset() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/closet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tryOnId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not add to closet");
    } else {
      setClosetItemId(data.item?.id ?? null);
    }
    setSubmitting(false);
  }

  async function removeFromCloset() {
    if (!closetItemId) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/closet/${closetItemId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not remove from closet");
    } else {
      setClosetItemId(null);
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <Button variant="outline" disabled>
        <Loader2 className="mr-2 size-4 animate-spin" />
        Checking closet…
      </Button>
    );
  }

  if (closetItemId) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={submitting}>
          <Shirt className="mr-2 size-4" />
          In your virtual closet
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/fitting-room">Open fitting room</Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={removeFromCloset}
          disabled={submitting}
          className="text-muted-foreground"
        >
          Remove
        </Button>
        {error && <p className="w-full text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={addToCloset} disabled={submitting}>
        {submitting ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Shirt className="mr-2 size-4" />
        )}
        Add to virtual closet
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
