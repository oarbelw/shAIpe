import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth";

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Invalid input", issues: error.issues },
      { status: 400 }
    );
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
