import { z } from "zod";
import { Hono } from "hono";
import OpenAI from "openai";
import { synthesizeGoogleTTS, type GoogleTTSEnv } from "../lib/google-tts";
import type { OpenAIEnv } from "../lib/openai";

const bodySchema = z.object({
  text: z.string().min(1),
  ttsProvider: z.enum(["openai", "google"]).optional(),
});

type Env = OpenAIEnv & GoogleTTSEnv;
type Variables = { userId: string };

/**
 * 任意テキストをTTSで音声化する。初回質問の読み上げや、単発の読み上げに利用。
 */
export const ttsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>().post(
  "/api/tts",
  async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const parseResult = bodySchema.safeParse(body);
    if (!parseResult.success) {
      return c.json({ error: "Invalid request body", details: parseResult.error.flatten() }, 400);
    }
    const { text, ttsProvider: requestedTts } = parseResult.data;
    const ttsProvider = requestedTts ?? "openai";

    const useGoogle =
      ttsProvider === "google" && !!c.env.GOOGLE_CLOUD_TTS_API_KEY?.trim();
    let audioBase64: string | null = null;
    let audioContentType: string | null = null;

    if (useGoogle) {
      const googleResult = await synthesizeGoogleTTS(c.env, text);
      if (googleResult) {
        audioBase64 = googleResult.audioBase64;
        audioContentType = googleResult.contentType;
      }
    }

    if (audioBase64 === null || audioContentType === null) {
      const client = new OpenAI({ apiKey: c.env.OPENAI_API_KEY });
      try {
        const speech = await client.audio.speech.create({
          model: "gpt-4o-mini-tts",
          voice: "nova",
          input: text,
          response_format: "mp3",
        });
        audioBase64 = btoa(
          String.fromCharCode(...new Uint8Array(await speech.arrayBuffer()))
        );
        audioContentType = "audio/mpeg";
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("TTS error:", msg);
        return c.json({ error: "Failed to synthesize speech" }, 500);
      }
    }

    return c.json({
      audioBase64,
      audioContentType,
    });
  }
);
