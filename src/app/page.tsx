import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STEPS = [
  {
    title: "Upload yourself",
    description:
      "Add a few full-body photos and your measurements to create your private body profile.",
  },
  {
    title: "Drop in clothing",
    description:
      "Paste a product URL from any store, or upload a clothing image. We pull the details automatically.",
  },
  {
    title: "Get realistic try-on previews",
    description:
      "See front and back previews of the item on you — not on a model.",
  },
  {
    title: "Fit and sizing guidance",
    description:
      "Honest fit predictions, size recommendations, and warnings when something runs small or large.",
  },
];

export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto max-w-5xl px-4">
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 py-24 text-center">
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          Your AI fitting room
        </span>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          See how clothes look on{" "}
          <span className="bg-gradient-to-r from-violet-500 to-fuchsia-400 bg-clip-text text-transparent">
            you
          </span>{" "}
          before you buy.
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          shAIpe combines your photos, your measurements, and real product data to answer the
          only question that matters: what would this actually look like on me?
        </p>
        <div className="flex gap-3">
          <Button asChild size="lg">
            <Link href={user ? "/dashboard" : "/sign-in"}>
              {user ? "Go to my dashboard" : "Create your shAIpe profile"}
            </Link>
          </Button>
          {!user && (
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <Card key={step.title}>
            <CardContent className="space-y-2">
              <span className="text-sm font-semibold text-muted-foreground">{i + 1}</span>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Privacy note */}
      <section className="pb-24 text-center">
        <p className="mx-auto max-w-xl text-sm text-muted-foreground">
          Your photos stay private. They&apos;re stored securely, never shared, never used for
          training without consent, and you can delete everything with one click.
        </p>
      </section>
    </div>
  );
}
