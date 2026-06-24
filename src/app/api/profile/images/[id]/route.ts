import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { deleteStoredFile, storagePathFromUrl } from "@/lib/storage";
import { handleApiError } from "@/lib/apiHelpers";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const image = await db.userImage.findUnique({ where: { id } });
    if (!image || image.userId !== user.id) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const storagePath = storagePathFromUrl(image.imageUrl);
    if (storagePath) await deleteStoredFile(storagePath);
    await db.userImage.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
