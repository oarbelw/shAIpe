# Deploy shAIpe for Jenna (and you)

## Important: GitHub Pages vs. the real app

**GitHub Pages cannot run shAIpe.** Pages only hosts static files (HTML/CSS). shAIpe is a full app that needs:

- A Node.js server (API routes, AI generation, scraping)
- A database (user profiles, try-ons)
- File storage (uploaded photos)
- Your Gemini API key (server-side)

GitHub Pro does **not** change this — Pages is still static-only.

**What we do instead:**

1. Host the **live app** on [Railway](https://railway.app) (free tier to start, connects to your GitHub repo).
2. Optionally use **GitHub Pages** as a pretty redirect (`yourname.github.io/...` → the Railway URL).

Jenna opens the Railway link (or your GitHub Pages redirect) on her phone or laptop — no install needed.

---

## Overview

| Step | What |
|------|------|
| 1 | Push code to GitHub |
| 2 | Create Railway project + PostgreSQL |
| 3 | Add environment variables |
| 4 | Deploy (automatic from GitHub) |
| 5 | Share the public URL with Jenna |
| 6 | (Optional) GitHub Pages redirect |

---

## Step 1 — Push to GitHub

If you haven't already:

```bash
cd /Users/orenarbel-wood/Documents/claudeapps/shAIpe

# Create repo on github.com first, then:
git add .
git commit -m "Prepare shAIpe for production deploy"
git remote add origin https://github.com/YOUR_USERNAME/shAIpe.git
git push -u origin main
```

**Never commit `.env`** — it contains your Gemini API key. It's already in `.gitignore`.

---

## Step 2 — Deploy on Railway

1. Go to [railway.app](https://railway.app) and sign in with **GitHub**.
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select your `shAIpe` repository.
4. Railway detects the `Dockerfile` and starts building (first build ~5–10 min).

### Add PostgreSQL

1. In your Railway project, click **+ New** → **Database** → **PostgreSQL**.
2. Click the Postgres service → **Variables** → copy `DATABASE_URL` (or use **Connect** → **Postgres connection URL**).

### Link database to the app

1. Click your **shAIpe web service** (not Postgres).
2. Go to **Variables**.
3. Add a variable referencing Postgres (Railway often offers **Add reference** → `DATABASE_URL` from the Postgres plugin).  
   Or paste the Postgres URL manually as `DATABASE_URL`.

### Add the rest of your environment variables

In the **web service** → **Variables**, add:

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | From Postgres (see above) |
| `GEMINI_API_KEY` | Your key from Google AI Studio |
| `GEMINI_IMAGE_MODEL` | `gemini-3.1-flash-image` |
| `GEMINI_TEXT_MODEL` | `gemini-2.5-flash` |
| `AUTHORIZED_EMAILS` | `oarbelw@gmail.com,jennamaya.c@gmail.com` |
| `NODE_ENV` | `production` |

### Persistent photo storage (important)

Uploaded images are stored on disk. Without a volume, they **disappear on redeploy**.

1. Click your web service → **Settings** → **Volumes**.
2. Add a volume: mount path **`/app/uploads`**, size 1 GB (or more).
3. The app already uses `UPLOADS_DIR=/app/uploads` in the Dockerfile.

### Public URL

1. Web service → **Settings** → **Networking** → **Generate domain**.
2. You'll get something like: `https://shaipe-production-xxxx.up.railway.app`
3. **Send this link to Jenna.** She signs in with `jennamaya.c@gmail.com`.

---

## Step 3 — Verify deploy

1. Railway **Deployments** tab should show **Success**.
2. Open your Railway URL in a browser.
3. Sign in with your email → complete onboarding → try a product URL.

First request after deploy may be slow while the server wakes up.

---

## Step 4 (optional) — GitHub Pages redirect

If you want a `github.io` link that forwards to Railway:

1. Edit `docs/index.html` and replace **both** occurrences of  
   `https://REPLACE-WITH-YOUR-RAILWAY-URL.up.railway.app`  
   with your real Railway URL.
2. Commit and push:
   ```bash
   git add docs/index.html
   git commit -m "Add GitHub Pages redirect to production app"
   git push
   ```
3. On GitHub: repo → **Settings** → **Pages**.
4. **Source:** Deploy from branch **`main`**, folder **`/docs`**.
5. Save. After a minute, Pages will be at:  
   `https://YOUR_USERNAME.github.io/shAIpe/`  
   (repo name must match; if repo is `shAIpe`, path is `/shAIpe/`).

Jenna can bookmark either the Railway URL or the GitHub Pages URL — both reach the same app.

---

## Updating the app later

Push to `main` on GitHub → Railway redeploys automatically.

```bash
git add .
git commit -m "Your change"
git push
```

---

## Costs (rough)

- **Railway:** ~$5/month credit on free trial; hobby usage often ~$5–15/mo with Postgres + small volume.
- **Gemini API:** pay per try-on (~$0.07–0.20 per full try-on depending on views/remixes).
- **GitHub Pages:** free.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails on Railway | Check **Deploy logs**; often missing env var or Docker timeout — retry deploy. |
| "Not authorized" for Jenna | Ensure `jennamaya.c@gmail.com` is in `AUTHORIZED_EMAILS` (lowercase is fine). |
| Photos disappear after redeploy | Add Railway volume at `/app/uploads`. |
| Scrape fails for some stores | Levi's blocks bots; use **Upload clothing image** tab. Aritzia should work (Playwright in Docker). |
| 502 / timeout on try-on | Try-ons take 30–90s; wait on the results page. Upgrade Railway plan if CPU is throttled. |

---

## Why not Vercel?

Vercel is great for static/Next sites but shAIpe needs long-running try-on jobs, Playwright, and disk for uploads. Railway's Docker + volume + Postgres fits better for this MVP.

---

## Local dev (unchanged)

```bash
npm install
npx prisma migrate dev
npm run dev
```

Local still uses SQLite (`DATABASE_URL=file:./dev.db` in `.env`). Production uses PostgreSQL via the Docker image only.
