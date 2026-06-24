import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/apiHelpers";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const item = await db.closetItem.findUnique({
      where: { id },
      include: { outfitLinks: true },
    });

    if (!item || item.userId !== user.id) {
      return NextResponse.json({ error: "Closet item not found" }, { status: 404 });
    }

    if (item.outfitLinks.length > 0) {
      return NextResponse.json(
        {
          error:
            "This item is part of a saved outfit try-on and cannot be removed from your closet",
        },
        { status: 409 }
      );
    }

    await db.closetItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
