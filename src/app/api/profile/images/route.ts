import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isSupportedImageType, saveFile } from "@/lib/storage";
import { handleApiError } from "@/lib/apiHelpers";
import { IMAGE_ANGLES, type ImageAngle } from "@/lib/validators";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const formData = await req.formData();

    const file = formData.get("file");
    const angle = formData.get("angle");

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
    if (typeof angle !== "string" || !IMAGE_ANGLES.includes(angle as ImageAngle)) {
      return NextResponse.json({ error: "Invalid image angle" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveFile(user.id, buffer, file.type, `ref-${angle}`);

    const image = await db.userImage.create({
      data: { userId: user.id, imageUrl: saved.url, angle },
    });

    return NextResponse.json({ image });
  } catch (error) {
    return handleApiError(error);
  }
}
