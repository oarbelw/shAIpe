# shAIpe — Your AI fitting room

AI visual shopping assistant: upload reference photos of yourself, enter body and sizing details, paste a clothing product URL (or upload a clothing image), and get a visual try-on preview plus fit analysis.

> shAIpe generates approximate visual previews. Results may not perfectly represent real-world fit, sizing, fabric behavior, or appearance. Always check the retailer's official sizing chart before purchasing.

## Getting started

```bash
npm install
npx prisma migrate dev   # creates the local SQLite database
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## AI configuration

Set these in `.env` to enable real AI generation (without a key, the app falls back to mock providers so everything still works end-to-end):

```
GEMINI_API_KEY=your_key            # from Google AI Studio
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image   # optional, this is the default
GEMINI_TEXT_MODEL=gemini-2.5-flash          # optional, this is the default
```

- **Try-on images** — one Gemini image-model call per view (front/back), each conditioned on all of the user's reference photos + the product image(s) so identity and garment stay faithful (`src/lib/imageGeneration.ts`).
- **Fit analysis** — one Gemini text-model call with structured JSON output, fed the user profile and the scraped product data (`src/lib/fitAnalysis.ts`). Falls back to the heuristic analyzer if the call fails.

## What's included (MVP)

- **Demo auth** — sign in with any email (cookie session). Swap for Clerk/NextAuth/Supabase in `src/lib/auth.ts`.
- **Body profile** — basics, usual sizes, measurements, and fit notes (`/profile`, `/onboarding`).
- **Reference photo uploads** — front/back (+ optional face/extra), stored privately on disk under `uploads/` and served only to the owning user via `/api/files/...`. Every uploaded photo is passed to each generation so the result locks onto the user's real identity.
- **Product scraper** — static fetch + cheerio with JSON-LD, Open Graph, and visible-text fallbacks (`src/lib/scraper.ts`). For JS-heavy retail sites, install the optional Playwright fallback: `npm i playwright && npx playwright install chromium` — the scraper picks it up automatically.
- **Manual product image upload** — for when scraping fails.
- **Try-on generation** — Gemini image generation when `GEMINI_API_KEY` is set; otherwise a mock provider that composites preview cards so the flow works without a key (`src/lib/imageGeneration.ts`). Generation runs asynchronously (`src/lib/tryOnPipeline.ts`): the results page polls and shows images live as each view completes, with fit analysis streaming in alongside.
- **Remix variations** — from any completed try-on, generate one-off variations ("make it red", "pair it with blue jeans", or any free-text tweak). Variations are child try-ons edited from the original generated image.
- **Fit analysis** — Gemini with structured JSON output when a key is set; heuristic analyzer otherwise (`src/lib/fitAnalysis.ts`).
- **Retry & delete** — failed generations can be retried in one click; try-ons (with their variations and files) can be deleted from the results page.
- **Invite-only access** — sign-in is restricted to an email allowlist (`AUTHORIZED_EMAILS` env var or the list in `src/lib/auth.ts`).
- **Try-on history** — `/try-ons` and recent try-ons on the dashboard.
- **Privacy controls** — delete individual photos, or delete account + all data (profile, photos, try-ons, files) in one click.

## Architecture

```
src/
  app/                  # Next.js App Router pages + API routes
    api/                #   auth, profile, product/scrape, try-on, files
  components/           # ProfileForm, ImageUploader, ProductUrlInput,
                        # ProductPreview, TryOnResult, FitAnalysisCard, ...
  lib/
    auth.ts             # demo cookie auth (swap for a real provider)
    db.ts               # Prisma client
    storage.ts          # local file storage (swap for S3/Supabase/R2)
    scraper.ts          # cheerio + JSON-LD/OG, optional Playwright
    promptBuilder.ts    # structured AI prompts (generation + fit)
    gemini.ts           # shared Gemini client + model selection
    imageGeneration.ts  # Gemini image provider + mock fallback
    fitAnalysis.ts      # Gemini fit analysis (JSON) + heuristic fallback
    validators.ts       # zod schemas
prisma/schema.prisma    # User, UserProfile, UserImage, Product, TryOn
```

Database is SQLite for zero-setup local development. To move to PostgreSQL, change the datasource in `prisma/schema.prisma` and convert the JSON-string array columns to native `String[]`.

## Tech stack

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Prisma · SQLite · Zod · React Hook Form · cheerio
