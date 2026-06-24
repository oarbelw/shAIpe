import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export const SEX_OPTIONS = ["female", "male", "non_binary", "prefer_not_to_say"] as const;
export const PREFERRED_FIT_OPTIONS = ["tight", "regular", "loose", "oversized"] as const;
export const IMAGE_ANGLES = ["front", "side", "back", "face", "other"] as const;
export const FIT_PREDICTIONS = ["too_small", "tight", "true_to_size", "relaxed", "too_large"] as const;

export type Sex = (typeof SEX_OPTIONS)[number];
export type PreferredFit = (typeof PREFERRED_FIT_OPTIONS)[number];
export type ImageAngle = (typeof IMAGE_ANGLES)[number];
export type FitPrediction = (typeof FIT_PREDICTIONS)[number];

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const signInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  name: z.string().trim().min(1, "Enter your name").max(100).optional(),
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

const optionalNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(min).max(max).optional()
  );

const optionalString = z
  .string()
  .trim()
  .max(100)
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  age: optionalNumber(13, 120),
  sex: z.enum(SEX_OPTIONS).optional(),
  heightCm: optionalNumber(80, 260),
  weightKg: optionalNumber(25, 350),
  bodyType: optionalString,
  preferredFit: z.enum(PREFERRED_FIT_OPTIONS).optional(),
  braSize: optionalString,
  jeanSize: optionalString,
  pantWaist: optionalString,
  pantInseam: optionalString,
  dressSize: optionalString,
  shoeSize: optionalString,
  underwearSize: optionalString,
  shirtSize: optionalString,
  jacketSize: optionalString,
  bustCm: optionalNumber(40, 220),
  waistCm: optionalNumber(35, 220),
  hipsCm: optionalNumber(40, 230),
  shoulderWidthCm: optionalNumber(25, 80),
  fitNotes: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export const scrapeRequestSchema = z.object({
  url: z.string().url("Enter a valid product URL"),
});

export const scrapedProductSchema = z.object({
  url: z.string().url().optional(),
  brand: z.string().optional(),
  title: z.string().min(1),
  price: z.string().optional(),
  currency: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  images: z.array(z.string().url()).default([]),
  availableSizes: z.array(z.string()).default([]),
  colors: z.array(z.string()).default([]),
  material: z.string().optional(),
  fitDescription: z.string().optional(),
  modelInfo: z.string().optional(),
  reviewsSummary: z.string().optional(),
  sizingFeedback: z
    .object({
      runsSmall: z.boolean().optional(),
      trueToSize: z.boolean().optional(),
      runsLarge: z.boolean().optional(),
      comments: z.array(z.string()).optional(),
    })
    .optional(),
  rawScrapedText: z.string().optional(),
});

export type ScrapedProduct = z.infer<typeof scrapedProductSchema>;

// ---------------------------------------------------------------------------
// Try-on
// ---------------------------------------------------------------------------

export const tryOnRequestSchema = z
  .object({
    productUrl: z.string().url().optional(),
    productImageUrl: z.string().min(1).optional(),
    productTitle: z.string().trim().max(200).optional(),
    productBrand: z.string().trim().max(100).optional(),
    productMaterial: z.string().trim().max(200).optional(),
    selectedSize: z.string().trim().max(30).optional(),
    selectedColor: z.string().trim().max(50).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((data) => data.productUrl || data.productImageUrl, {
    message: "Provide a product URL or upload a product image",
    path: ["productUrl"],
  });

export type TryOnRequest = z.infer<typeof tryOnRequestSchema>;

export const variationRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(3, "Describe the change you want, e.g. \"make the shirt red\"")
    .max(300),
});

export const addToClosetSchema = z.object({
  tryOnId: z.string().min(1),
  label: z.string().trim().max(100).optional(),
});

export const outfitRequestSchema = z.object({
  closetItemIds: z.array(z.string().min(1)).min(2, "Select at least 2 items").max(6),
  notes: z.string().trim().max(1000).optional(),
});

export type FitAnalysis = {
  predictedFit: FitPrediction;
  recommendedSize?: string;
  confidence: number;
  explanation: string;
  warnings?: string[];
};
