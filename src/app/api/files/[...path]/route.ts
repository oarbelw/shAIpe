import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ownerOfStoragePath, readStoredFile } from "@/lib/storage";

/**
 * Serves uploaded/generated images. Files are namespaced by user id and only
 * the owning, signed-in user can access them -- user images are never public.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const storagePath = segments.join("/");

  const user = await getCurrentUser();
  if (!user || ownerOfStoragePath(storagePath) !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await readStoredFile(storagePath);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
