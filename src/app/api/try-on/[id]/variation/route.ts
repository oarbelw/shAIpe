import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db, parseJsonArray } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { variationRequestSchema } from "@/lib/validators";
import { runVariationPipeline } from "@/lib/tryOnPipeline";
import { serializeTryOn } from "@/lib/serializers";
import { handleApiError } from "@/lib/apiHelpers";

/**
 * Creates a variation ("remix") of a completed try-on, e.g. "make the shirt
 * red" or "pair it with blue jeans". Generation runs in the background; the
 * results page polls the parent try-on for variation status.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { prompt } = variationRequestSchema.parse(await req.json());

    const parent = await db.tryOn.findUnique({ where: { id } });
    if (!parent || parent.userId !== user.id) {
      return NextResponse.json({ error: "Try-on not found" }, { status: 404 });
    }
    if (parent.parentId) {
      return NextResponse.json(
        { error: "Variations can only be created from an original try-on." },
        { status: 400 }
      );
    }
    if (parent.status !== "completed" || parseJsonArray(parent.generatedImages).length === 0) {
      return NextResponse.json(
        { error: "Wait for the try-on to finish before creating variations." },
        { status: 400 }
      );
    }

    const variation = await db.tryOn.create({
      data: {
        userId: user.id,
        productId: parent.productId,
        parentId: parent.id,
        variationPrompt: prompt,
        selectedSize: parent.selectedSize,
        selectedColor: parent.selectedColor,
        status: "generating",
      },
    });

    after(() => runVariationPipeline(variation.id));

    return NextResponse.json({ variation: serializeTryOn(variation) });
  } catch (error) {
    return handleApiError(error);
  }
}
