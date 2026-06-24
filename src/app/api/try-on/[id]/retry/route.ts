import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { runTryOnPipeline, runVariationPipeline, runOutfitPipeline } from "@/lib/tryOnPipeline";
import { serializeTryOn } from "@/lib/serializers";
import { handleApiError } from "@/lib/apiHelpers";

/** Re-runs generation for a failed (or stuck) try-on or variation. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const tryOn = await db.tryOn.findUnique({ where: { id } });
    if (!tryOn || tryOn.userId !== user.id) {
      return NextResponse.json({ error: "Try-on not found" }, { status: 404 });
    }
    if (tryOn.status === "completed") {
      return NextResponse.json({ error: "This try-on already completed." }, { status: 400 });
    }

    const updated = await db.tryOn.update({
      where: { id },
      data: { status: "generating" },
      include: {
        product: true,
        outfitItems: {
          include: {
            closetItem: {
              include: { tryOn: { include: { product: true } } },
            },
          },
        },
      },
    });

    after(() => {
      if (tryOn.parentId) return runVariationPipeline(id);
      if (tryOn.kind === "outfit") return runOutfitPipeline(id);
      return runTryOnPipeline(id);
    });

    return NextResponse.json({ tryOn: serializeTryOn(updated) });
  } catch (error) {
    return handleApiError(error);
  }
}
