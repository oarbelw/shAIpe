import type { UserProfile, Product, User } from "@prisma/client";

export type TryOnPromptContext = {
  user: User;
  profile: UserProfile | null;
  product: Product;
  selectedSize?: string | null;
  selectedColor?: string | null;
  userNotes?: string | null;
  view: "front" | "side" | "back";
};

/**
 * Builds the structured generation prompt from spec section 8. The prompt is
 * passed to whichever ImageGenerationProvider is active.
 */
export function buildTryOnPrompt(ctx: TryOnPromptContext): string {
  const { profile, product } = ctx;

  const measurements = [
    profile?.bustCm && `bust ${profile.bustCm}cm`,
    profile?.waistCm && `waist ${profile.waistCm}cm`,
    profile?.hipsCm && `hips ${profile.hipsCm}cm`,
    profile?.shoulderWidthCm && `shoulders ${profile.shoulderWidthCm}cm`,
    profile?.jeanSize && `jean size ${profile.jeanSize}`,
    profile?.dressSize && `dress size ${profile.dressSize}`,
    profile?.shirtSize && `shirt size ${profile.shirtSize}`,
  ]
    .filter(Boolean)
    .join(", ");

  return `Generate a realistic ${ctx.view}-view try-on image of the user wearing the provided clothing item.
Use the user's uploaded reference photos to preserve:
- Face likeness
- Body shape
- Skin tone
- Hair
- Height and proportions
- General posture

Clothing item:
- Brand: ${product.brand ?? "unknown"}
- Product name: ${product.title}
- Category: ${product.category ?? "unknown"}
- Material: ${product.material ?? "unknown"}
- Fit description: ${product.fitDescription ?? "unknown"}
- Selected size: ${ctx.selectedSize ?? "not specified"}
- Color: ${ctx.selectedColor ?? "as shown"}

Body context:
- Height: ${profile?.heightCm ? `${profile.heightCm} cm` : "unknown"}
- Weight: ${profile?.weightKg ? `${profile.weightKg} kg` : "unknown"}
- Sex: ${profile?.sex ?? "unspecified"}
- Measurements: ${measurements || "not provided"}
- Preferred fit: ${profile?.preferredFit ?? "regular"}
${ctx.userNotes ? `\nUser notes: ${ctx.userNotes}` : ""}
Render the item realistically on the user's body.
Respect the actual material, cut, coverage, tightness, length, and silhouette.
Do not make the user thinner, larger, younger, or more sexualized.
Do not alter the user's face beyond normal lighting consistency.
Use a clean neutral background.`;
}

export function buildFitAnalysisPrompt(ctx: {
  profile: UserProfile | null;
  product: Product;
  selectedSize?: string | null;
}): string {
  const { profile, product } = ctx;
  return `You are a clothing fit assistant.
Analyze whether this product is likely to fit the user well.

User profile:
${JSON.stringify(profile, null, 2)}

Product data:
${JSON.stringify(
    {
      title: product.title,
      brand: product.brand,
      category: product.category,
      material: product.material,
      fitDescription: product.fitDescription,
      description: product.description,
      selectedSize: ctx.selectedSize,
    },
    null,
    2
  )}

Reviews and sizing notes:
${product.reviewsSummary ?? "none available"}

Raw text scraped from the product page (may contain sizing hints):
${product.rawScrapedText?.slice(0, 2500) ?? "none available"}

User preferred fit:
${profile?.preferredFit ?? "regular"}

Return:
- Predicted fit
- Recommended size
- Confidence score from 0 to 1
- Short explanation
- Any warnings

Return JSON.`;
}
