import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeClosetItem } from "@/lib/serializers";
import { VirtualClosetGrid } from "@/components/VirtualClosetGrid";

export default async function FittingRoomPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const items = await db.closetItem.findMany({
    where: { userId: user.id },
    include: { tryOn: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 space-y-2">
        <h1 className="text-2xl font-bold">My virtual fitting room</h1>
        <p className="text-muted-foreground">
          Mix and match pieces you have already tried on. Select items from your{" "}
          <Link href="/try-ons" className="underline underline-offset-4">
            virtual closet
          </Link>{" "}
          to preview them together.
        </p>
      </div>
      <VirtualClosetGrid initialItems={items.map(serializeClosetItem)} />
    </div>
  );
}
