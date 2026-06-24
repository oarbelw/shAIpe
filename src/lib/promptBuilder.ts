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
  view: "front" | "back";
  visualSpec?: ProductVisualSpec | null;
};

const VIEW_GUIDANCE: Record<"front" | "back", string> = {
  front:
    "Show the person from the FRONT: face clearly visible and facing the camera, full body from head to mid-thigh or lower.",
  back:
    "Show the person from the BACK: the back of their head, hair, and body facing the camera (face not visible), full body from head to mid-thigh or lower. Use the back reference photo for body shape and the back of the garment.",
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

  return `You are creating a photorealistic virtual try-on. Think of this as PHOTO-EDITING the attached reference photos of one specific real person — NOT generating a new person who merely resembles them.

TASK: Produce a ${ctx.view}-view photo of THIS EXACT PERSON wearing THE EXACT garment from the product reference photo(s). The only thing that changes versus their reference photos is the clothing.

CRITICAL — IDENTITY (highest priority, must be perfect):
- The attached USER REFERENCE photos show ONE real, specific person. The output MUST be unmistakably that same person — as if they took a new photo of themselves wearing this item.
- Preserve their EXACT face and facial features (eyes, nose, mouth, jaw, eyebrows), face shape, skin tone and complexion, hair color/length/style, body shape and proportions, height, and apparent age.
- Do NOT swap in a generic model, stock body, or an "improved" version of them. Do NOT slim, enlarge, beautify, smooth, retouch, de-age, or otherwise idealize the person. Keep freckles, marks, glasses, and real-world features.
- If multiple reference photos are provided, treat them as the SAME person from different angles and combine them for maximum likeness.
- ${VIEW_GUIDANCE[ctx.view]}

CRITICAL — GARMENT FIDELITY (must be exact):
- The attached PRODUCT reference photo(s) are the ONLY source of truth for the garment. Reproduce the SAME item: exact fabric color, printed graphics, logos, trim, hardware, cut, length, and construction.
- If several product photos are provided, treat them as the SAME garment from different angles (e.g. front and back); use whichever angle matches this view.
- Do NOT redesign, restyle, recolor, or substitute a similar-looking item. It must read as the identical product, not "something like it".
- Do NOT guess colors from brand or product names (e.g. "Strawberry" does NOT mean pink) — go by the pixels in the product photo.

CRITICAL — NO MARKETING TEXT ON THE GARMENT:
- NEVER render product descriptions, website copy, bullet points, feature lists, prices, or care instructions on the clothing.
- ONLY reproduce text/graphics physically printed ON THE GARMENT in the product photo (e.g. a logo or wordmark on the fabric).
- The metadata below is context only — it must NOT appear as text on the clothing.
${visualSpecBlock}

Product metadata (context only — do not print on the garment):
- Brand: ${product.brand ?? "unknown"}
- Product name: ${product.title}
- Category: ${product.category ?? "unknown"}
- Material: ${product.material ?? "unknown"}
- Selected size: ${ctx.selectedSize ?? "not specified"}
- Color: ${colorLine}

Fit context (use to render how the garment drapes on this body, not to change the body):
- Height: ${profile?.heightCm ? `${profile.heightCm} cm` : "unknown"}
- Weight: ${profile?.weightKg ? `${profile.weightKg} kg` : "unknown"}
- Sex: ${profile?.sex ?? "unspecified"}
- Measurements: ${measurements || "not provided"}
- Preferred fit: ${profile?.preferredFit ?? "regular"}
${ctx.userNotes ? `\nUser notes: ${ctx.userNotes}` : ""}
Render the garment realistically on this person's actual body, respecting its true material, cut, coverage, tightness, length, and silhouette.
Output a single photorealistic image with natural lighting, sharp focus on the person, and a clean neutral studio background.
Do not alter the person's face or body beyond natural lighting consistency.`;
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
  view: "front" | "back";
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

  return `You are photo-editing the attached reference photos of one specific real person. Produce a ${ctx.view}-view photo of THIS EXACT PERSON wearing ALL of the following clothing items together as one cohesive outfit.

CRITICAL — IDENTITY (must be perfect):
- The output MUST be unmistakably the same person in the user reference photos — exact face, facial features, skin tone, hair, body shape, proportions, height, and apparent age.
- Do NOT substitute a generic model or an idealized version of them. Do NOT slim, enlarge, beautify, retouch, or de-age the person.

Outfit items to combine (wear all of them together):
${itemList}

Each item below is shown as a reference image of how it looks on this user from a previous try-on. Combine them into a single natural outfit, keeping each garment's exact design and color.

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
