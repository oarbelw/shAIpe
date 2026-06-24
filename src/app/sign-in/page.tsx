import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SignInForm } from "@/components/SignInForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SignInPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-20">
      <Card>
        <CardHeader>
          <CardTitle>Welcome to shAIpe</CardTitle>
          <CardDescription>
            Sign in or create your account to start building your fitting room.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm />
        </CardContent>
      </Card>
    </div>
  );
}
