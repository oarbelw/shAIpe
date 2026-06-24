import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { serializeClosetItem } from "@/lib/serializers";
import { handleApiError } from "@/lib/apiHelpers";
import { addToClosetSchema } from "@/lib/validators";

const closetInclude = {
  tryOn: { include: { product: true } },
} as const;

export async function GET() {
  try {
    const user = await requireUser();
    const items = await db.closetItem.findMany({
      where: { userId: user.id },
      include: closetInclude,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ items: items.map(serializeClosetItem) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const parsed = addToClosetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    const tryOn = await db.tryOn.findUnique({
      where: { id: parsed.data.tryOnId },
      include: { closetSource: true },
    });

    if (!tryOn || tryOn.userId !== user.id) {
      return NextResponse.json({ error: "Try-on not found" }, { status: 404 });
    }
    if (tryOn.kind !== "single" || tryOn.parentId) {
      return NextResponse.json(
        { error: "Only original single-item try-ons can be added to your closet" },
        { status: 400 }
      );
    }
    if (tryOn.status !== "completed") {
      return NextResponse.json(
        { error: "Try-on must be completed before adding to closet" },
        { status: 400 }
      );
    }
    if (tryOn.closetSource) {
      return NextResponse.json(
        { error: "This try-on is already in your closet" },
        { status: 409 }
      );
    }

    const item = await db.closetItem.create({
      data: {
        userId: user.id,
        tryOnId: tryOn.id,
        label: parsed.data.label,
      },
      include: closetInclude,
    });

    return NextResponse.json({ item: serializeClosetItem(item) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
