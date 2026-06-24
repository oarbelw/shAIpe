import { mkdir, writeFile, unlink, readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

/**
 * Local file storage for development. Files live in `<project>/uploads/<userId>/...`
 * and are served through the authenticated /api/files/[...path] route so user
 * images are never publicly exposed. Swap for Supabase Storage / S3 / R2 in
 * production by reimplementing these functions.
 */

const UPLOADS_ROOT = process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

export function isSupportedImageType(mimeType: string): boolean {
  return mimeType in EXTENSION_BY_MIME;
}

export async function saveFile(
  userId: string,
  data: Buffer,
  mimeType: string,
  prefix = "img"
): Promise<{ storagePath: string; url: string }> {
  const ext = EXTENSION_BY_MIME[mimeType] ?? "bin";
  const fileName = `${prefix}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  const dir = path.join(UPLOADS_ROOT, userId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), data);

  const storagePath = `${userId}/${fileName}`;
  return { storagePath, url: `/api/files/${storagePath}` };
}

export async function readStoredFile(
  storagePath: string
): Promise<{ data: Buffer; mimeType: string } | null> {
  const safePath = normalizeStoragePath(storagePath);
  if (!safePath) return null;
  try {
    const data = await readFile(path.join(UPLOADS_ROOT, safePath));
    return { data, mimeType: mimeTypeFromPath(safePath) };
  } catch {
    return null;
  }
}

export async function deleteStoredFile(storagePath: string): Promise<void> {
  const safePath = normalizeStoragePath(storagePath);
  if (!safePath) return;
  try {
    await unlink(path.join(UPLOADS_ROOT, safePath));
  } catch {
    // Already gone -- nothing to do.
  }
}

/** Extract the storage path from an /api/files/... URL. */
export function storagePathFromUrl(url: string): string | null {
  const prefix = "/api/files/";
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

export function ownerOfStoragePath(storagePath: string): string | null {
  const safePath = normalizeStoragePath(storagePath);
  return safePath ? safePath.split("/")[0] : null;
}

function normalizeStoragePath(storagePath: string): string | null {
  const normalized = path.posix.normalize(storagePath);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) return null;
  return normalized;
}

export function mimeTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const byExt: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
  };
  return byExt[ext] ?? "application/octet-stream";
}
