import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { OnboardingFlow } from "@/components/OnboardingFlow";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const images = await db.userImage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Set up your fitting room</h1>
        <p className="text-muted-foreground">
          A few details about you make your previews and sizing guidance accurate.
        </p>
      </div>
      <OnboardingFlow
        initialName={user.name}
        initialProfile={user.profile}
        initialImages={images}
      />
    </div>
  );
}
