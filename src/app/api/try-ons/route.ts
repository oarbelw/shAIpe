import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { serializeTryOn } from "@/lib/serializers";
import { handleApiError } from "@/lib/apiHelpers";

export async function GET() {
  try {
    const user = await requireUser();
    const tryOns = await db.tryOn.findMany({
      where: { userId: user.id, parentId: null },
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
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ tryOns: tryOns.map(serializeTryOn) });
  } catch (error) {
    return handleApiError(error);
  }
}
