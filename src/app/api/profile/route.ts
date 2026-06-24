import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, signOut } from "@/lib/auth";
import { profileSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/apiHelpers";
import { deleteStoredFile, storagePathFromUrl } from "@/lib/storage";
import { parseJsonArray } from "@/lib/db";

export async function GET() {
  try {
    const user = await requireUser();
    const images = await db.userImage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
      profile: user.profile,
      images,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { name, ...profileData } = profileSchema.parse(await req.json());

    const [, profile] = await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { name } }),
      db.userProfile.upsert({
        where: { userId: user.id },
        update: profileData,
        create: { userId: user.id, ...profileData },
      }),
    ]);

    return NextResponse.json({ profile });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Privacy control: permanently deletes the user's account, profile, reference
 * images (including files on disk), try-ons, and generated images.
 */
export async function DELETE() {
  try {
    const user = await requireUser();

    const [images, tryOns] = await Promise.all([
      db.userImage.findMany({ where: { userId: user.id } }),
      db.tryOn.findMany({ where: { userId: user.id } }),
    ]);

    const filePaths = [
      ...images.map((img) => storagePathFromUrl(img.imageUrl)),
      ...tryOns.flatMap((t) => parseJsonArray(t.generatedImages).map(storagePathFromUrl)),
    ].filter((p): p is string => !!p);

    await Promise.all(filePaths.map(deleteStoredFile));
    await db.user.delete({ where: { id: user.id } });
    await signOut();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
