import { NextRequest, NextResponse } from "next/server";
import { db, parseJsonArray } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { serializeTryOn } from "@/lib/serializers";
import { handleApiError } from "@/lib/apiHelpers";
import { deleteStoredFile, storagePathFromUrl } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const tryOn = await db.tryOn.findUnique({
      where: { id },
      include: {
        product: true,
        variations: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!tryOn || tryOn.userId !== user.id) {
      return NextResponse.json({ error: "Try-on not found" }, { status: 404 });
    }

    return NextResponse.json({ tryOn: serializeTryOn(tryOn) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Deletes a try-on (and its variations) along with all generated image files. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const tryOn = await db.tryOn.findUnique({
      where: { id },
      include: { variations: true },
    });
    if (!tryOn || tryOn.userId !== user.id) {
      return NextResponse.json({ error: "Try-on not found" }, { status: 404 });
    }

    const filePaths = [tryOn, ...tryOn.variations]
      .flatMap((t) => parseJsonArray(t.generatedImages))
      .map(storagePathFromUrl)
      .filter((p): p is string => !!p);

    await Promise.all(filePaths.map(deleteStoredFile));
    await db.tryOn.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
