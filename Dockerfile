# Production image for Railway / Render / Fly.io
FROM node:20-bookworm AS base
WORKDIR /app

# Install dependencies (skip postinstall — schema not copied yet)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# App source (use PostgreSQL schema in production)
COPY . .
RUN cp prisma/schema.postgres.prisma prisma/schema.prisma

# Prisma client + Next.js build
RUN npx prisma generate
RUN npm run build

# Playwright + Chromium for product scraping (Aritzia, etc.)
RUN npx playwright install --with-deps chromium

ENV NODE_ENV=production
ENV UPLOADS_DIR=/app/uploads

EXPOSE 3000

# Sync DB schema, then start the server
CMD ["sh", "-c", "npx prisma db push && npm start"]
