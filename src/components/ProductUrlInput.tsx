"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ScrapedProduct } from "@/lib/validators";

export function ProductUrlInput({
  onScraped,
}: {
  onScraped: (product: ScrapedProduct, url: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFetch() {
    if (!url) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/product/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "Could not read that product page");
    } else {
      onScraped(data.product, url);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="product-url">Product URL</Label>
        <div className="flex gap-2">
          <Input
            id="product-url"
            type="url"
            placeholder="https://www.aritzia.com/en/product/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleFetch();
              }
            }}
          />
          <Button type="button" onClick={handleFetch} disabled={loading || !url}>
            {loading ? "Fetching…" : "Fetch product"}
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        We&apos;ll pull the title, images, price, sizes, and fit details from the page when
        possible. Some stores (Aritzia, Zara, etc.) take a few extra seconds because they use
        bot protection — that&apos;s normal. If a page still can&apos;t be read, upload a
        product image instead.
      </p>
    </div>
  );
}
