import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";

const SESSION_COOKIE = "shaipe_session";

/**
 * Only these emails can register or sign in. Add entries here (or via the
 * AUTHORIZED_EMAILS env var, comma-separated) to grant access.
 */
const AUTHORIZED_EMAILS = [
  "oarbelw@gmail.com",
  "jennamaya.c@gmail.com",
];

export function isAuthorizedEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const fromEnv =
    process.env.AUTHORIZED_EMAILS?.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean) ??
    [];
  return AUTHORIZED_EMAILS.includes(normalized) || fromEnv.includes(normalized);
}

/**
 * Lightweight demo auth: signing in with an allowlisted email creates (or
 * finds) a user and stores their id in an httpOnly cookie. Swap for
 * Clerk/NextAuth/Supabase Auth in production -- the rest of the app only
 * depends on getCurrentUser().
 */
export async function signIn(email: string, name?: string) {
  if (!isAuthorizedEmail(email)) {
    throw new UnauthorizedEmailError();
  }

  const user = await db.user.upsert({
    where: { email: email.toLowerCase() },
    update: name ? { name } : {},
    create: { email: email.toLowerCase(), name },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return user;
}

export async function signOut() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });

  // Revoke sessions for accounts removed from the allowlist.
  if (user && !isAuthorizedEmail(user.email)) return null;

  return user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new AuthError();
  return user;
}

export class AuthError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "AuthError";
  }
}

export class UnauthorizedEmailError extends Error {
  constructor() {
    super("This email isn't authorized to use shAIpe yet.");
    this.name = "UnauthorizedEmailError";
  }
}
