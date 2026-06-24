import { NextRequest, NextResponse } from "next/server";
import { signIn, UnauthorizedEmailError } from "@/lib/auth";
import { signInSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/apiHelpers";

export async function POST(req: NextRequest) {
  try {
    const body = signInSchema.parse(await req.json());
    const user = await signIn(body.email, body.name);
    return NextResponse.json({ id: user.id, email: user.email, name: user.name });
  } catch (error) {
    if (error instanceof UnauthorizedEmailError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return handleApiError(error);
  }
}
