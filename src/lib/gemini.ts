import { GoogleGenAI } from "@google/genai";

/**
 * Shared Gemini client. Returns null when GEMINI_API_KEY is not configured,
 * in which case the app falls back to the mock providers.
 */

let client: GoogleGenAI | null | undefined;

export function getGeminiClient(): GoogleGenAI | null {
  if (client !== undefined) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  return client;
}

export const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image";
export const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";
