import { z } from "zod";
import { Hono } from "hono";
import { createSupabaseClient, type SupabaseEnv } from "../lib/supabase";
import { getFormatGuidelineForTurn } from "../lib/interviewPhases";
import { getChatTurn } from "../lib/openai";
import type { OpenAIEnv } from "../lib/openai";

const chatBodySchema = z.object({
  interviewId: z.string().uuid(),
  userMessage: z.string().min(1),
});

type Env = SupabaseEnv & OpenAIEnv;
type Variables = { userId: string };

export const chatRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()
  .post("/api/chat", async (c) => {
    const userId = c.get("userId");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const parseResult = chatBodySchema.safeParse(body);
    if (!parseResult.success) {
      return c.json({ error: "Invalid request body", details: parseResult.error.flatten() }, 400);
    }
    const { interviewId, userMessage } = parseResult.data;

    const supabase = createSupabaseClient(c.env);

    let { data: interview, error: interviewError } = await supabase
      .from("interviews")
      .select("id, profile_snapshot")
      .eq("id", interviewId)
      .eq("user_id", userId)
      .single();
    if (interviewError && (interviewError as { code?: string }).code === "PGRST204") {
      // profile_snapshot 列が無い環境向け互換
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

    const response = await getChatTurn(c.env, messages, userMessage, {
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
    }

    const { error: insertAsstErr } = await supabase.from("messages").insert({
      interview_id: interviewId,
      role: "assistant",
      content: response.message,
      correction: response.correction || null,
    });
    if (insertAsstErr) {
      console.error("messages insert assistant error:", insertAsstErr);
    }

    for (const tag of response.weakness_tags) {
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

    return c.json({
      message: response.message,
      correction: response.correction,
      is_finished: response.is_finished,
      weakness_tags: response.weakness_tags,
    });
  });
