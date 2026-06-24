import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/apiHelpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tryOnId: string }> }
) {
  try {
    const user = await requireUser();
    const { tryOnId } = await params;

    const item = await db.closetItem.findFirst({
      where: { tryOnId, userId: user.id },
      select: { id: true },
    });

    return NextResponse.json({ inCloset: !!item, closetItemId: item?.id ?? null });
  } catch (error) {
    return handleApiError(error);
  }
}
