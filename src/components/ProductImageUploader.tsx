"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function ProductImageUploader({
  imageUrl,
  onUploaded,
}: {
  imageUrl?: string | null;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/product/image", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "Upload failed");
    } else {
      onUploaded(data.url);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      {imageUrl ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Product"
            className="max-h-72 w-auto rounded-lg border object-contain"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => inputRef.current?.click()}
          >
            Replace image
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={loading}
          onClick={() => inputRef.current?.click()}
          className="flex h-48 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
        >
          {loading ? "Uploading…" : "+ Upload a clothing image"}
          <span className="text-xs">JPEG, PNG, or WebP, up to 10 MB</span>
        </button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
