import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProfileForm } from "@/components/ProfileForm";
import { ImageUploader } from "@/components/ImageUploader";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { Separator } from "@/components/ui/separator";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const images = await db.userImage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">Your profile</h1>
        <p className="text-muted-foreground">
          Everything here is private and only used to generate your previews.
        </p>
      </div>

      <section>
        <ProfileForm initialName={user.name} initialProfile={user.profile} />
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Reference photos</h2>
          <p className="text-sm text-muted-foreground">
            A clear front and back photo give the best results. A face close-up sharpens
            your likeness even more.
          </p>
        </div>
        <ImageUploader initialImages={images} />
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Privacy</h2>
          <p className="text-sm text-muted-foreground">
            Delete individual photos above, or remove your account and every piece of data we
            hold about you below.
          </p>
        </div>
        <DeleteAccountButton />
      </section>
    </div>
  );
}
