import { z } from "zod";
import type { Product, UserProfile } from "@prisma/client";
import { FIT_PREDICTIONS, type FitAnalysis, type FitPrediction } from "@/lib/validators";
import { buildFitAnalysisPrompt } from "@/lib/promptBuilder";
import { getGeminiClient, GEMINI_TEXT_MODEL } from "@/lib/gemini";

// ---------------------------------------------------------------------------
// Fit analysis provider abstraction. Gemini (structured JSON output) when
// GEMINI_API_KEY is set; otherwise a heuristic mock over scraped product data.
// ---------------------------------------------------------------------------

export type FitAnalysisInput = {
  profile: UserProfile | null;
  product: Product;
  selectedSize?: string | null;
};

export interface FitAnalysisProvider {
  analyze(input: FitAnalysisInput): Promise<FitAnalysis>;
}

export function getFitAnalysisProvider(): FitAnalysisProvider {
  if (getGeminiClient()) return new GeminiFitAnalysisProvider();
  return new MockFitAnalysisProvider();
}

// ---------------------------------------------------------------------------
// Gemini provider
// ---------------------------------------------------------------------------

const fitAnalysisResponseSchema = z.object({
  predictedFit: z.enum(FIT_PREDICTIONS),
  recommendedSize: z.string().optional().nullable(),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1),
  warnings: z.array(z.string()).optional().nullable(),
});

class GeminiFitAnalysisProvider implements FitAnalysisProvider {
  async analyze(input: FitAnalysisInput): Promise<FitAnalysis> {
    const client = getGeminiClient();
    if (!client) throw new Error("Gemini client not configured");

    const prompt = buildFitAnalysisPrompt(input);

    try {
      const response = await client.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              predictedFit: { type: "string", enum: [...FIT_PREDICTIONS] },
              recommendedSize: { type: "string" },
              confidence: { type: "number" },
              explanation: { type: "string" },
              warnings: { type: "array", items: { type: "string" } },
            },
            required: ["predictedFit", "confidence", "explanation"],
          },
        },
      });

      const text = response.text;
      if (!text) throw new Error("Gemini returned an empty fit analysis");

      const parsed = fitAnalysisResponseSchema.parse(JSON.parse(text));
      return {
        predictedFit: parsed.predictedFit,
        recommendedSize: parsed.recommendedSize ?? undefined,
        confidence: Math.round(parsed.confidence * 100) / 100,
        explanation: parsed.explanation,
        warnings: parsed.warnings?.length ? parsed.warnings : undefined,
      };
    } catch (error) {
      // Fit analysis should never sink an otherwise-successful try-on.
      console.error("Gemini fit analysis failed, falling back to heuristics:", error);
      return new MockFitAnalysisProvider().analyze(input);
    }
  }
}

// ---------------------------------------------------------------------------
// Heuristic (mock) provider
// ---------------------------------------------------------------------------

class MockFitAnalysisProvider implements FitAnalysisProvider {
  async analyze(input: FitAnalysisInput): Promise<FitAnalysis> {
    const { profile, product, selectedSize } = input;
    const text = [product.description, product.fitDescription, product.rawScrapedText, product.reviewsSummary]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const warnings: string[] = [];
    let confidence = 0.55;

    // Material / stretch signals
    const hasStretch = /elastane|spandex|stretch|lycra/.test(text);
    if (product.material) confidence += 0.08;
    if (!hasStretch && /denim|leather|woven|structured/.test(text)) {
      warnings.push("Material appears to have limited stretch");
    }

    // Sizing signals from page text / reviews
    const runsSmall = /runs small|size up|sized up|fits small|snug fit/.test(text);
    const runsLarge = /runs large|size down|sized down|fits big|generous fit/.test(text);
    const slimCut = /slim fit|fitted|bodycon|second-skin|tight fit/.test(text);
    const relaxedCut = /relaxed fit|oversized|boxy|loose fit/.test(text);
    if (runsSmall || runsLarge) confidence += 0.12;
    if (slimCut || relaxedCut) confidence += 0.08;

    const preferred = profile?.preferredFit ?? "regular";

    let predictedFit: FitPrediction = "true_to_size";
    if (runsSmall || (slimCut && (preferred === "loose" || preferred === "oversized"))) {
      predictedFit = "tight";
    } else if (runsLarge || (relaxedCut && preferred === "tight")) {
      predictedFit = "relaxed";
    }

    const recommendedSize = recommendSize(predictedFit, preferred, selectedSize);

    if (!profile?.heightCm || !profile?.weightKg) {
      warnings.push("Add height and weight to your profile for a more confident estimate");
      confidence -= 0.08;
    }

    confidence = Math.max(0.2, Math.min(0.92, confidence));

    return {
      predictedFit,
      recommendedSize,
      confidence: Math.round(confidence * 100) / 100,
      explanation: buildExplanation(predictedFit, preferred, {
        hasStretch,
        runsSmall,
        runsLarge,
        slimCut,
        relaxedCut,
        selectedSize,
        recommendedSize,
      }),
      warnings: warnings.length ? warnings : undefined,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SIZE_LADDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL"];

function recommendSize(
  predictedFit: FitPrediction,
  preferred: string,
  selectedSize?: string | null
): string | undefined {
  if (!selectedSize) return undefined;
  const idx = SIZE_LADDER.indexOf(selectedSize.toUpperCase());
  if (idx === -1) return selectedSize;

  if (predictedFit === "tight" && preferred !== "tight" && idx < SIZE_LADDER.length - 1) {
    return SIZE_LADDER[idx + 1];
  }
  if (predictedFit === "relaxed" && preferred === "tight" && idx > 0) {
    return SIZE_LADDER[idx - 1];
  }
  return selectedSize;
}

function buildExplanation(
  predictedFit: FitPrediction,
  preferred: string,
  signals: {
    hasStretch: boolean;
    runsSmall: boolean;
    runsLarge: boolean;
    slimCut: boolean;
    relaxedCut: boolean;
    selectedSize?: string | null;
    recommendedSize?: string;
  }
): string {
  const parts: string[] = [];

  if (signals.slimCut) {
    parts.push("This item appears to have a fitted cut");
  } else if (signals.relaxedCut) {
    parts.push("This item appears to have a relaxed, roomier cut");
  } else {
    parts.push("This item looks close to a standard cut");
  }

  if (signals.hasStretch) {
    parts.push("the fabric appears to have some stretch, which gives you flexibility on sizing");
  }

  if (signals.runsSmall) {
    parts.push("the product page or reviews suggest it runs small");
  } else if (signals.runsLarge) {
    parts.push("the product page or reviews suggest it runs large");
  }

  let sentence = parts.join(", and ") + ".";

  if (
    signals.selectedSize &&
    signals.recommendedSize &&
    signals.recommendedSize !== signals.selectedSize
  ) {
    sentence += ` Since you prefer a ${preferred} fit, consider size ${signals.recommendedSize} instead of ${signals.selectedSize}.`;
  } else if (signals.selectedSize) {
    sentence += ` Your selected size ${signals.selectedSize} should work for a ${preferred} fit.`;
  } else {
    sentence += ` For a ${preferred} fit, your usual size is a reasonable starting point.`;
  }

  if (predictedFit === "tight") {
    sentence += " If you want a more relaxed look, sizing up is a safe choice.";
  } else if (predictedFit === "relaxed") {
    sentence += " If you want the exact fitted model look, consider sizing down.";
  }

  return sentence;
}
