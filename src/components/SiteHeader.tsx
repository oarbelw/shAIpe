import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/SignOutButton";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2">
          <span className="bg-gradient-to-r from-violet-500 to-fuchsia-400 bg-clip-text text-xl font-bold text-transparent">
            shAIpe
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Your AI fitting room
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/try-ons">My try-ons</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/fitting-room">Fitting room</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/profile">Profile</Link>
              </Button>
              <Button asChild size="sm" className="ml-2">
                <Link href="/try-on/new">New try-on</Link>
              </Button>
              <SignOutButton />
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
