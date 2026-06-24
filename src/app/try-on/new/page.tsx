import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NewTryOnForm } from "@/components/NewTryOnForm";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default async function NewTryOnPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const imageCount = await db.userImage.count({ where: { userId: user.id } });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">New try-on</h1>
        <p className="text-muted-foreground">
          Paste a product link or upload a clothing image to see it on you.
        </p>
      </div>

      {imageCount === 0 && (
        <Alert>
          <AlertDescription>
            You haven&apos;t uploaded any reference photos yet, so try-ons can&apos;t be
            generated.{" "}
            <Link href="/onboarding" className="font-medium underline underline-offset-4">
              Upload your photos first
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <NewTryOnForm />
    </div>
  );
}
