import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeTryOn } from "@/lib/serializers";
import { TryOnHistoryGrid } from "@/components/TryOnHistoryGrid";
import { Button } from "@/components/ui/button";

export default async function TryOnsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const tryOns = await db.tryOn.findMany({
    where: { userId: user.id, parentId: null },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My try-ons</h1>
          <p className="text-muted-foreground">
            {tryOns.length} try-on{tryOns.length === 1 ? "" : "s"} so far
          </p>
        </div>
        <Button asChild>
          <Link href="/try-on/new">+ New try-on</Link>
        </Button>
      </div>

      <TryOnHistoryGrid tryOns={tryOns.map(serializeTryOn)} />
    </div>
  );
}
