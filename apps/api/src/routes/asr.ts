import { Hono } from "hono";
import { z } from "zod";
import OpenAI, { toFile } from "openai";
import type { OpenAIEnv } from "../lib/openai";

const querySchema = z.object({
  // 将来の拡張用（例: 言語やモデル指定）。現状は全て日本語前提でデフォルト。
  lang: z.string().optional(),
});

type Env = OpenAIEnv;
type Variables = { userId: string };

export const asrRoutes = new Hono<{ Bindings: Env; Variables: Variables }>().post(
  "/api/asr",
  async (c) => {
    // 認証は index.ts 側の .use(requireAuth) で済んでいる想定
    const contentType = c.req.header("Content-Type") ?? "";
    if (!contentType.startsWith("audio/") && !contentType.startsWith("application/octet-stream")) {
      return c.json({ error: "Content-Type must be audio/*" }, 400);
    }

    const url = new URL(c.req.url);
    const parseResult = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!parseResult.success) {
      return c.json({ error: "Invalid query parameters" }, 400);
    }
    const lang = parseResult.data.lang ?? "ja";

    let buffer: ArrayBuffer;
    try {
      buffer = await c.req.arrayBuffer();
    } catch {
      return c.json({ error: "Failed to read audio data" }, 400);
    }

    if (!buffer || buffer.byteLength === 0) {
      return c.json({ error: "Empty audio payload" }, 400);
    }

    const client = new OpenAI({ apiKey: c.env.OPENAI_API_KEY });

    try {
      const file = await toFile(new Blob([buffer]), "speech.webm", {
        type: contentType || "audio/webm",
      });

      const result = await client.audio.transcriptions.create({
        file,
        // Whisper ベースの日本語ASR。将来 gpt-4o-mini-transcribe 等に差し替え可能。
        model: "whisper-1",
        language: lang,
        response_format: "json",
      });

      return c.json({
        text: (result as { text?: string }).text ?? "",
        raw: result,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("ASR error:", msg);
      return c.json({ error: "Failed to transcribe audio" }, 500);
    }
  }
);

