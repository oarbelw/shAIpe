"use client";

import { useRef, useState } from "react";
import type { UserImage } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ImageAngle } from "@/lib/validators";

const SLOTS: Array<{ angle: ImageAngle; label: string; required: boolean }> = [
  { angle: "front", label: "Front", required: true },
  { angle: "side", label: "Side", required: true },
  { angle: "back", label: "Back", required: true },
  { angle: "face", label: "Face close-up", required: false },
  { angle: "other", label: "Extra", required: false },
];

export function ImageUploader({
  initialImages,
  onChange,
}: {
  initialImages: UserImage[];
  onChange?: (images: UserImage[]) => void;
}) {
  const [images, setImages] = useState<UserImage[]>(initialImages);
  const [error, setError] = useState<string | null>(null);
  const [busyAngle, setBusyAngle] = useState<string | null>(null);

  function update(next: UserImage[]) {
    setImages(next);
    onChange?.(next);
  }

  async function upload(angle: ImageAngle, file: File) {
    setBusyAngle(angle);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("angle", angle);

    const res = await fetch("/api/profile/images", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "Upload failed");
    } else {
      update([...images, data.image]);
    }
    setBusyAngle(null);
  }

  async function remove(image: UserImage) {
    setBusyAngle(image.angle);
    setError(null);

    const res = await fetch(`/api/profile/images/${image.id}`, { method: "DELETE" });
    if (res.ok) {
      update(images.filter((img) => img.id !== image.id));
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not delete image");
    }
    setBusyAngle(null);
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          For best results: good lighting, neutral pose, full body visible, minimal baggy
          clothing, no heavy filters or mirror distortion.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {SLOTS.map((slot) => (
          <UploadSlot
            key={slot.angle}
            slot={slot}
            image={images.find((img) => img.angle === slot.angle)}
            busy={busyAngle === slot.angle}
            onUpload={(file) => upload(slot.angle, file)}
            onRemove={remove}
          />
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Your photos are private, stored securely, and only used to generate your previews. You
        can delete them at any time.
      </p>
    </div>
  );
}

function UploadSlot({
  slot,
  image,
  busy,
  onUpload,
  onRemove,
}: {
  slot: { angle: ImageAngle; label: string; required: boolean };
  image?: UserImage;
  busy: boolean;
  onUpload: (file: File) => void;
  onRemove: (image: UserImage) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{slot.label}</span>
        {slot.required && !image && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Required
          </span>
        )}
      </div>

      {image ? (
        <div className="group relative overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.imageUrl}
            alt={`${slot.label} reference`}
            className="aspect-[3/4] w-full object-cover"
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => onRemove(image)}
            className="absolute right-2 top-2 h-7 px-2 text-xs opacity-0 transition-opacity group-hover:opacity-100"
          >
            Delete
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
        >
          {busy ? "Uploading…" : "+ Add photo"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
