import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isSupportedImageType, saveFile } from "@/lib/storage";
import { handleApiError } from "@/lib/apiHelpers";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

/** Manual product image upload (Option B in spec section 5.3). */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!isSupportedImageType(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Use JPEG, PNG, or WebP." },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Image must be under 10 MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveFile(user.id, buffer, file.type, "product");

    return NextResponse.json({ url: saved.url });
  } catch (error) {
    return handleApiError(error);
  }
}
