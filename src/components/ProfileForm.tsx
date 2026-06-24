"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import type { UserProfile } from "@prisma/client";
import { profileSchema, SEX_OPTIONS, PREFERRED_FIT_OPTIONS } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FormValues = Record<string, string>;

const SEX_LABELS: Record<string, string> = {
  female: "Female",
  male: "Male",
  non_binary: "Non-binary",
  prefer_not_to_say: "Prefer not to say",
};

const SIZING_FIELDS: Array<{ key: string; label: string; placeholder?: string }> = [
  { key: "braSize", label: "Bra size", placeholder: "34B" },
  { key: "jeanSize", label: "Jean size", placeholder: "27" },
  { key: "pantWaist", label: "Pant waist", placeholder: "28" },
  { key: "pantInseam", label: "Pant inseam", placeholder: "30" },
  { key: "dressSize", label: "Dress size", placeholder: "S / 6" },
  { key: "shoeSize", label: "Shoe size", placeholder: "8.5" },
  { key: "underwearSize", label: "Underwear size", placeholder: "M" },
  { key: "shirtSize", label: "Shirt size", placeholder: "M" },
  { key: "jacketSize", label: "Jacket size", placeholder: "M" },
];

const MEASUREMENT_FIELDS: Array<{ key: string; label: string }> = [
  { key: "bustCm", label: "Chest/bust (cm)" },
  { key: "waistCm", label: "Waist (cm)" },
  { key: "hipsCm", label: "Hips (cm)" },
  { key: "shoulderWidthCm", label: "Shoulder width (cm)" },
];

export function ProfileForm({
  initialName,
  initialProfile,
  submitLabel = "Save profile",
  onSaved,
}: {
  initialName?: string | null;
  initialProfile?: UserProfile | null;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const p = initialProfile;
  const { register, handleSubmit, control, setError, formState } = useForm<FormValues>({
    defaultValues: {
      name: initialName ?? "",
      age: p?.age?.toString() ?? "",
      sex: p?.sex ?? "",
      heightCm: p?.heightCm?.toString() ?? "",
      weightKg: p?.weightKg?.toString() ?? "",
      bodyType: p?.bodyType ?? "",
      preferredFit: p?.preferredFit ?? "",
      braSize: p?.braSize ?? "",
      jeanSize: p?.jeanSize ?? "",
      pantWaist: p?.pantWaist ?? "",
      pantInseam: p?.pantInseam ?? "",
      dressSize: p?.dressSize ?? "",
      shoeSize: p?.shoeSize ?? "",
      underwearSize: p?.underwearSize ?? "",
      shirtSize: p?.shirtSize ?? "",
      jacketSize: p?.jacketSize ?? "",
      bustCm: p?.bustCm?.toString() ?? "",
      waistCm: p?.waistCm?.toString() ?? "",
      hipsCm: p?.hipsCm?.toString() ?? "",
      shoulderWidthCm: p?.shoulderWidthCm?.toString() ?? "",
      fitNotes: p?.fitNotes ?? "",
    },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSaved(false);

    const cleaned = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, v === "" ? undefined : v])
    );
    const parsed = profileSchema.safeParse(cleaned);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string") {
          setError(field, { message: issue.message });
        }
      }
      return;
    }

    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setServerError(data.error ?? "Could not save profile");
      return;
    }

    setSaved(true);
    onSaved?.();
  }

  const err = (key: string) => formState.errors[key]?.message as string | undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Basics */}
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold">Basics</h3>
          <p className="text-sm text-muted-foreground">
            Used to render proportions accurately in your previews.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={err("name")}>
            <Input placeholder="Your name" {...register("name")} />
          </Field>
          <Field label="Age" error={err("age")}>
            <Input type="number" placeholder="28" {...register("age")} />
          </Field>
          <Field label="Sex" error={err("sex")}>
            <Controller
              control={control}
              name="sex"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {SEX_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {SEX_LABELS[opt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Preferred fit" error={err("preferredFit")}>
            <Controller
              control={control}
              name="preferredFit"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {PREFERRED_FIT_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt} className="capitalize">
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Height (cm)" error={err("heightCm")}>
            <Input type="number" placeholder="170" {...register("heightCm")} />
          </Field>
          <Field label="Weight (kg)" error={err("weightKg")}>
            <Input type="number" placeholder="65" {...register("weightKg")} />
          </Field>
          <Field label="General body type" error={err("bodyType")} className="sm:col-span-2">
            <Input placeholder="e.g. pear, athletic, curvy, tall and lean" {...register("bodyType")} />
          </Field>
        </div>
      </section>

      <Separator />

      {/* Sizing */}
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold">Your usual sizes (optional)</h3>
          <p className="text-sm text-muted-foreground">
            The more you add, the better the sizing recommendations.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {SIZING_FIELDS.map(({ key, label, placeholder }) => (
            <Field key={key} label={label} error={err(key)}>
              <Input placeholder={placeholder} {...register(key)} />
            </Field>
          ))}
        </div>
      </section>

      <Separator />

      {/* Measurements */}
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold">Measurements (optional)</h3>
          <p className="text-sm text-muted-foreground">In centimeters.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          {MEASUREMENT_FIELDS.map(({ key, label }) => (
            <Field key={key} label={label} error={err(key)}>
              <Input type="number" {...register(key)} />
            </Field>
          ))}
        </div>
        <Field label="Fit preference notes" error={err("fitNotes")}>
          <Textarea
            placeholder="e.g. I like tops loose but pants fitted. Sleeves usually run short on me."
            rows={3}
            {...register("fitNotes")}
          />
        </Field>
      </section>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Saving…" : submitLabel}
        </Button>
        {saved && <span className="text-sm text-muted-foreground">Saved ✓</span>}
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
