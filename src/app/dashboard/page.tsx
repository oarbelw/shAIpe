import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeTryOn } from "@/lib/serializers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TryOnHistoryGrid } from "@/components/TryOnHistoryGrid";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const [images, tryOns] = await Promise.all([
    db.userImage.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    db.tryOn.findMany({
      where: { userId: user.id, parentId: null },
      include: {
        product: true,
        outfitItems: {
          include: {
            closetItem: {
              include: { tryOn: { include: { product: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  const needsOnboarding = !user.profile || images.length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Hi{user.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-muted-foreground">Your AI fitting room is ready.</p>
        </div>
        <Button asChild size="lg">
          <Link href="/try-on/new">+ New try-on</Link>
        </Button>
      </div>

      {needsOnboarding && (
        <Card className="border-primary/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium">Finish setting up your fitting room</p>
              <p className="text-sm text-muted-foreground">
                {!user.profile
                  ? "Add your body profile and reference photos to get accurate previews."
                  : "Upload your reference photos to get accurate previews."}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/onboarding">Continue setup</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {user.profile ? (
              <>
                {user.profile.heightCm && (
                  <p>
                    <span className="text-muted-foreground">Height:</span> {user.profile.heightCm} cm
                  </p>
                )}
                {user.profile.weightKg && (
                  <p>
                    <span className="text-muted-foreground">Weight:</span> {user.profile.weightKg} kg
                  </p>
                )}
                {user.profile.preferredFit && (
                  <p className="capitalize">
                    <span className="text-muted-foreground">Preferred fit:</span>{" "}
                    {user.profile.preferredFit}
                  </p>
                )}
                {user.profile.bodyType && (
                  <p>
                    <span className="text-muted-foreground">Body type:</span> {user.profile.bodyType}
                  </p>
                )}
                <Link
                  href="/profile"
                  className="inline-block pt-1 text-sm text-primary underline underline-offset-4"
                >
                  Edit profile
                </Link>
              </>
            ) : (
              <p className="text-muted-foreground">No profile yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Reference images */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Reference photos</CardTitle>
          </CardHeader>
          <CardContent>
            {images.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {images.map((img) => (
                  <div key={img.id} className="shrink-0 text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.imageUrl}
                      alt={`${img.angle} reference`}
                      className="h-32 w-24 rounded-md border object-cover"
                    />
                    <span className="text-xs capitalize text-muted-foreground">{img.angle}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No photos uploaded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent try-ons */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent try-ons</h2>
          <Link href="/try-ons" className="text-sm text-primary underline underline-offset-4">
            View all
          </Link>
        </div>
        <TryOnHistoryGrid tryOns={tryOns.map(serializeTryOn)} />
      </div>
    </div>
  );
}
