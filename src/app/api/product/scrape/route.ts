import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { scrapeProduct, ScrapeError } from "@/lib/scraper";
import { scrapeRequestSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/apiHelpers";

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const { url } = scrapeRequestSchema.parse(await req.json());
    const product = await scrapeProduct(url);
    return NextResponse.json({ product });
  } catch (error) {
    if (error instanceof ScrapeError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return handleApiError(error);
  }
}
