import type { UserProfile, Product, User } from "@prisma/client";
import type { ProductVisualSpec } from "@/lib/productVisualAnalysis";
import { extractColorHintsFromProduct, formatVisualSpecForPrompt } from "@/lib/productVisualAnalysis";

export type TryOnPromptContext = {
  user: User;
  profile: UserProfile | null;
  product: Product;
  selectedSize?: string | null;
  selectedColor?: string | null;
  userNotes?: string | null;
  view: "front" | "side" | "back";
  visualSpec?: ProductVisualSpec | null;
};

/**
 * Builds the structured generation prompt from spec section 8. The prompt is
 * passed to whichever ImageGenerationProvider is active.
 */
export function buildTryOnPrompt(ctx: TryOnPromptContext): string {
  const { profile, product, visualSpec } = ctx;

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

  const scrapedColors = extractColorHintsFromProduct(product);
  const colorLine = ctx.selectedColor
    ? ctx.selectedColor
    : visualSpec?.primaryColor
      ? visualSpec.primaryColor
      : scrapedColors.length > 0
        ? scrapedColors.join(", ")
        : "match the product reference image exactly";

  const visualSpecBlock = visualSpec
    ? `\nExact appearance to reproduce (from product photo analysis):\n${formatVisualSpecForPrompt(visualSpec)}`
    : scrapedColors.length > 0
      ? `\nColor hints from product page: ${scrapedColors.join(", ")}`
      : "";

  return `Generate a realistic ${ctx.view}-view try-on image of the user wearing the EXACT clothing item shown in the attached product reference photo.

CRITICAL — PRODUCT FIDELITY (highest priority):
- The attached product reference photo is the ONLY source of truth for this garment's appearance.
- Reproduce the EXACT fabric color, printed graphics, logos, and construction visible in that photo.
- Do NOT guess colors from brand or product names (e.g. "Strawberry" does NOT mean pink).
- The garment on the user must look like the same item as in the product photo.

CRITICAL — DO NOT PRINT MARKETING TEXT ON THE GARMENT:
- NEVER render product descriptions, website copy, bullet points, feature lists, or care instructions on the clothing.
- NEVER print text like "These shorts have lining", inseam measurements, pocket descriptions, or brand mission statements on the fabric.
- ONLY reproduce text/graphics that are physically printed ON THE GARMENT in the product reference photo (e.g. a logo or brand wordmark on the fabric).
- Marketing metadata below is for context only — it must NOT appear as text on the clothing.
${visualSpecBlock}

Use the user's uploaded reference photos to preserve:
- Face likeness
- Body shape
- Skin tone
- Hair
- Height and proportions
- General posture

Minimal product metadata (do not print this on the garment):
- Brand: ${product.brand ?? "unknown"}
- Product name: ${product.title}
- Category: ${product.category ?? "unknown"}
- Material: ${product.material ?? "unknown"}
- Selected size: ${ctx.selectedSize ?? "not specified"}
- Color: ${colorLine}

Body context:
- Height: ${profile?.heightCm ? `${profile.heightCm} cm` : "unknown"}
- Weight: ${profile?.weightKg ? `${profile.weightKg} kg` : "unknown"}
- Sex: ${profile?.sex ?? "unspecified"}
- Measurements: ${measurements || "not provided"}
- Preferred fit: ${profile?.preferredFit ?? "regular"}
${ctx.userNotes ? `\nUser notes: ${ctx.userNotes}` : ""}
Render the item realistically on the user's body.
Respect the actual material, cut, coverage, tightness, length, and silhouette from the product reference.
Do not make the user thinner, larger, younger, or more sexualized.
Do not alter the user's face beyond normal lighting consistency.
Use a clean neutral background.`;
}

export type OutfitPromptItem = {
  product: Product;
  selectedSize?: string | null;
  selectedColor?: string | null;
};

export function buildOutfitPrompt(ctx: {
  user: User;
  profile: UserProfile | null;
  items: OutfitPromptItem[];
  userNotes?: string | null;
  view: "front" | "side" | "back";
}): string {
  const { profile, items } = ctx;

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

  const itemList = items
    .map((item, i) => {
      const p = item.product;
      return `${i + 1}. ${p.brand ? `${p.brand} ` : ""}${p.title} (${p.category ?? "clothing"})${
        item.selectedSize ? `, size ${item.selectedSize}` : ""
      }${item.selectedColor ? `, color ${item.selectedColor}` : ""}`;
    })
    .join("\n");

  return `Generate a realistic ${ctx.view}-view image of the user wearing ALL of the following clothing items together as one cohesive outfit.
Use the user's uploaded reference photos to preserve:
- Face likeness
- Body shape
- Skin tone
- Hair
- Height and proportions
- General posture

Outfit items to combine (wear all of them together):
${itemList}

Each item below is shown as a reference image of how it looks on this user from a previous try-on. Combine them into a single natural outfit.

Body context:
- Height: ${profile?.heightCm ? `${profile.heightCm} cm` : "unknown"}
- Weight: ${profile?.weightKg ? `${profile.weightKg} kg` : "unknown"}
- Sex: ${profile?.sex ?? "unspecified"}
- Measurements: ${measurements || "not provided"}
- Preferred fit: ${profile?.preferredFit ?? "regular"}
${ctx.userNotes ? `\nUser notes: ${ctx.userNotes}` : ""}
Render all items realistically on the user's body together.
Respect actual materials, cuts, coverage, and silhouettes.
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
