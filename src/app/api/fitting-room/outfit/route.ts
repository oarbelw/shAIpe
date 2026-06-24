import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { serializeTryOn } from "@/lib/serializers";
import { handleApiError } from "@/lib/apiHelpers";
import { outfitRequestSchema } from "@/lib/validators";
import { runOutfitPipeline } from "@/lib/tryOnPipeline";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const parsed = outfitRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    const imageCount = await db.userImage.count({ where: { userId: user.id } });
    if (imageCount === 0) {
      return NextResponse.json(
        { error: "Upload reference photos before trying on outfits" },
        { status: 400 }
      );
    }

    const uniqueIds = [...new Set(parsed.data.closetItemIds)];
    const closetItems = await db.closetItem.findMany({
      where: { id: { in: uniqueIds }, userId: user.id },
      include: { tryOn: { include: { product: true } } },
    });

    if (closetItems.length !== uniqueIds.length) {
      return NextResponse.json({ error: "One or more closet items were not found" }, { status: 404 });
    }

    for (const item of closetItems) {
      if (item.tryOn.status !== "completed") {
        return NextResponse.json(
          { error: "All closet items must be from completed try-ons" },
          { status: 400 }
        );
      }
    }

    const tryOn = await db.tryOn.create({
      data: {
        userId: user.id,
        kind: "outfit",
        status: "generating",
        userNotes: parsed.data.notes,
        outfitItems: {
          create: uniqueIds.map((closetItemId) => ({ closetItemId })),
        },
      },
      include: {
        product: true,
        variations: true,
        outfitItems: {
          include: {
            closetItem: {
              include: { tryOn: { include: { product: true } } },
            },
          },
        },
      },
    });

    after(() => runOutfitPipeline(tryOn.id));

    return NextResponse.json({ tryOn: serializeTryOn(tryOn) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
