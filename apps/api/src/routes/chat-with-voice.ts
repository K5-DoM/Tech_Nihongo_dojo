import { z } from "zod";
import { Hono } from "hono";
import { createSupabaseClient, type SupabaseEnv } from "../lib/supabase";
import { getFormatGuidelineForTurn } from "../lib/interviewPhases";
import { getChatTurn, type OpenAIEnv } from "../lib/openai";
import { synthesizeGoogleTTS, type GoogleTTSEnv } from "../lib/google-tts";
import OpenAI from "openai";

const bodySchema = z.object({
  interviewId: z.string().uuid(),
  userMessage: z.string().min(1),
  ttsProvider: z.enum(["openai", "google"]).optional(),
});

type Env = SupabaseEnv & OpenAIEnv & GoogleTTSEnv;
type Variables = { userId: string };

export const chatWithVoiceRoutes = new Hono<{ Bindings: Env; Variables: Variables }>().post(
  "/api/chat-with-voice",
  async (c) => {
    const userId = c.get("userId");

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
    const { interviewId, userMessage, ttsProvider: requestedTts } = parseResult.data;
    const ttsProvider = requestedTts ?? "openai";

    const supabase = createSupabaseClient(c.env);

    let { data: interview, error: interviewError } = await supabase
      .from("interviews")
      .select("id, profile_snapshot")
      .eq("id", interviewId)
      .eq("user_id", userId)
      .single();
    if (interviewError && (interviewError as { code?: string }).code === "PGRST204") {
      ({ data: interview, error: interviewError } = await supabase
        .from("interviews")
        .select("id")
        .eq("id", interviewId)
        .eq("user_id", userId)
        .single());
    }

    if (interviewError || !interview) {
      return c.json({ error: "Interview not found or access denied" }, 404);
    }

    const { data: historyRows } = await supabase
      .from("messages")
      .select("role, content")
      .eq("interview_id", interviewId)
      .order("created_at", { ascending: true });

    const messages = (historyRows ?? []).map((r) => ({
      role: r.role as "user" | "assistant" | "system",
      content: r.content,
    }));

    const { data: weaknessRows } = await supabase
      .from("weakness_history")
      .select("weakness_tag")
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false })
      .limit(10);
    const recentWeaknessTags = [
      ...new Set(
        (weaknessRows ?? []).map((r) =>
          r.weakness_tag === "too_abstract" ? "ambiguous" : r.weakness_tag
        )
      ),
    ];

    const assistantMessageCount = messages.filter((m) => m.role === "assistant").length;
    const currentFormatGuideline = getFormatGuidelineForTurn(assistantMessageCount);

    const rawSnapshot = (interview as { profile_snapshot?: unknown }).profile_snapshot;
    const profileContext =
      rawSnapshot && typeof rawSnapshot === "object" ? (rawSnapshot as any) : undefined;

    const chatResponse = await getChatTurn(c.env, messages, userMessage, {
      recentWeaknessTags,
      currentFormatGuideline,
      profileContext,
    });

    const { error: insertUserErr } = await supabase.from("messages").insert({
      interview_id: interviewId,
      role: "user",
      content: userMessage,
    });
    if (insertUserErr) {
      console.error("messages insert user error:", insertUserErr);
      return c.json({ error: "Failed to save message" }, 500);
    }

    const { error: insertAsstErr } = await supabase.from("messages").insert({
      interview_id: interviewId,
      role: "assistant",
      content: chatResponse.message,
      correction: chatResponse.correction || null,
    });
    if (insertAsstErr) {
      console.error("messages insert assistant error:", insertAsstErr);
      return c.json({ error: "Failed to save message" }, 500);
    }

    for (const tag of chatResponse.weakness_tags) {
      const { data: existing } = await supabase
        .from("weakness_history")
        .select("id, seen_count")
        .eq("user_id", userId)
        .eq("weakness_tag", tag)
        .single();

      const now = new Date().toISOString();
      if (existing) {
        await supabase
          .from("weakness_history")
          .update({
            last_seen_at: now,
            seen_count: existing.seen_count + 1,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("weakness_history").insert({
          user_id: userId,
          weakness_tag: tag,
          severity: 1,
          first_seen_at: now,
          last_seen_at: now,
          seen_count: 1,
        });
      }
    }

    // テキストを TTS で音声化（プロバイダー: google 指定かつキーあり → Google、それ以外 → OpenAI）
    const useGoogle =
      ttsProvider === "google" && !!c.env.GOOGLE_CLOUD_TTS_API_KEY?.trim();
    let audioBase64: string | null = null;
    let audioContentType: string | null = null;

    if (useGoogle) {
      const googleResult = await synthesizeGoogleTTS(c.env, chatResponse.message);
      if (googleResult) {
        audioBase64 = googleResult.audioBase64;
        audioContentType = googleResult.contentType;
      }
    }

    if (audioBase64 === null && audioContentType === null) {
      // Google 未使用、未設定、または失敗 → OpenAI にフォールバック
      const client = new OpenAI({ apiKey: c.env.OPENAI_API_KEY });
      try {
        const speech = await client.audio.speech.create({
          model: "gpt-4o-mini-tts",
          voice: "nova",
          input: chatResponse.message,
          response_format: "mp3",
        });
        audioBase64 = btoa(
          String.fromCharCode(...new Uint8Array(await speech.arrayBuffer()))
        );
        audioContentType = "audio/mpeg";
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("TTS error:", msg);
      }
    }

    return c.json({
      message: chatResponse.message,
      correction: chatResponse.correction,
      is_finished: chatResponse.is_finished,
      weakness_tags: chatResponse.weakness_tags,
      audioBase64,
      audioContentType,
    });
  }
);

