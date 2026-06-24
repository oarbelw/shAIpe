import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeTryOn } from "@/lib/serializers";
import { TryOnResult } from "@/components/TryOnResult";

export default async function TryOnResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const { id } = await params;
  const tryOn = await db.tryOn.findUnique({
    where: { id },
    include: { product: true, variations: { orderBy: { createdAt: "asc" } } },
  });
  if (!tryOn || tryOn.userId !== user.id) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <TryOnResult tryOn={serializeTryOn(tryOn)} />
    </div>
  );
}
