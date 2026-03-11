import { z } from "zod";
import { Hono } from "hono";
import { createSupabaseClient, type SupabaseEnv } from "../lib/supabase";
import { getFirstQuestion, getEvaluation } from "../lib/openai";
import type { OpenAIEnv } from "../lib/openai";

const startInterviewBodySchema = z.object({
  mode: z.string().default("standard"),
  profileSnapshot: z
    .object({
      researchTheme: z.string().optional(),
      techStack: z.array(z.string()).optional(),
      targetRole: z.string().optional(),
    })
    .optional()
    .default({}),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

type Env = SupabaseEnv & OpenAIEnv;
type Variables = { userId: string };

export const interviewsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get("/api/interviews", async (c) => {
    const userId = c.get("userId");
    const parseResult = listQuerySchema.safeParse({
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
    });
    const { limit, offset } = parseResult.success ? parseResult.data : { limit: 20, offset: 0 };
    const supabase = createSupabaseClient(c.env);

    const { data: rows, error } = await supabase
      .from("interviews")
      .select("id, started_at, ended_at, status, evaluations(summary)")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("interviews list error:", error);
      return c.json({ error: "Failed to list interviews" }, 500);
    }

    const items = (rows ?? []).map((r: { id: string; started_at: string; ended_at: string | null; status: string; evaluations: { summary: string }[] | null }) => ({
      id: r.id,
      started_at: r.started_at,
      ended_at: r.ended_at,
      status: r.status,
      summary: Array.isArray(r.evaluations) && r.evaluations[0] ? r.evaluations[0].summary : null,
    }));
    return c.json({ interviews: items });
  })
  .get("/api/interviews/:id", async (c) => {
    const userId = c.get("userId");
    const interviewId = c.req.param("id");
    const supabase = createSupabaseClient(c.env);

    const { data: interview, error: interviewError } = await supabase
      .from("interviews")
      .select("id, started_at, ended_at, status")
      .eq("id", interviewId)
      .eq("user_id", userId)
      .single();

    if (interviewError || !interview) {
      return c.json({ error: "Interview not found or access denied" }, 404);
    }

    const { data: messageRows } = await supabase
      .from("messages")
      .select("role, content, correction, created_at")
      .eq("interview_id", interviewId)
      .order("created_at", { ascending: true });

    const { data: evalRow } = await supabase
      .from("evaluations")
      .select("score_logic, score_accuracy, score_clarity, score_keigo, score_specificity, strengths, weaknesses, next_actions, summary")
      .eq("interview_id", interviewId)
      .single();

    const messages = (messageRows ?? []).map((m: { role: string; content: string; correction: string | null; created_at: string }) => ({
      role: m.role,
      content: m.content,
      correction: m.correction ?? undefined,
      created_at: m.created_at,
    }));

    const evaluation = evalRow
      ? {
          logic: evalRow.score_logic,
          accuracy: evalRow.score_accuracy,
          clarity: evalRow.score_clarity,
          keigo: evalRow.score_keigo,
          specificity: evalRow.score_specificity,
          strengths: evalRow.strengths,
          weaknesses: evalRow.weaknesses,
          nextActions: evalRow.next_actions,
          summary: evalRow.summary,
        }
      : undefined;

    return c.json({
      id: interview.id,
      started_at: interview.started_at,
      ended_at: interview.ended_at,
      status: interview.status,
      messages,
      evaluation,
    });
  })
  .post("/api/interviews", async (c) => {
    const userId = c.get("userId");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const parseResult = startInterviewBodySchema.safeParse(body);
    if (!parseResult.success) {
      return c.json({ error: "Invalid request body", details: parseResult.error.flatten() }, 400);
    }
    const { mode, profileSnapshot } = parseResult.data;

    const supabase = createSupabaseClient(c.env);

    // interviews.user_id は profiles(id) を参照するため、Supabase Auth でサインアップ直後は
    // profiles に行がない場合がある。先に profiles を upsert して FK を満たす。
    const { error: profileUpsertError } = await supabase
      .from("profiles")
      .upsert({ id: userId, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (profileUpsertError) {
      console.error("profiles upsert error:", profileUpsertError);
      return c.json({ error: "Failed to ensure profile" }, 500);
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("display_name, major, research_theme, tech_stack, target_role, target_company_type, jp_level")
      .eq("id", userId)
      .single();

    const baseSnapshot = {
      displayName: profileRow?.display_name ?? undefined,
      major: profileRow?.major ?? undefined,
      researchTheme: profileRow?.research_theme ?? undefined,
      techStack: profileRow?.tech_stack ?? undefined,
      targetRole: profileRow?.target_role ?? undefined,
      targetCompanyType: profileRow?.target_company_type ?? undefined,
      jpLevel: profileRow?.jp_level ?? undefined,
    };
    const mergedSnapshot = {
      ...baseSnapshot,
      ...(profileSnapshot ?? {}),
    };

    const insertWithSnapshot = async () =>
      supabase
        .from("interviews")
        .insert({
          user_id: userId,
          mode,
          status: "active",
          profile_snapshot: mergedSnapshot,
        })
        .select("id")
        .single();

    const insertWithoutSnapshot = async () =>
      supabase
        .from("interviews")
        .insert({
          user_id: userId,
          mode,
          status: "active",
        })
        .select("id")
        .single();

    let { data: interview, error: insertError } = await insertWithSnapshot();
    if (insertError && (insertError as { code?: string }).code === "PGRST204") {
      // DB が未マイグレーション（profile_snapshot列なし）の場合は互換のためスナップショット無しで継続
      ({ data: interview, error: insertError } = await insertWithoutSnapshot());
    }

    if (insertError || !interview) {
      console.error("interviews insert error:", insertError);
      return c.json({ error: "Failed to create interview" }, 500);
    }

    let firstQuestion: string;
    try {
      firstQuestion = await getFirstQuestion(c.env, {
        researchTheme: mergedSnapshot.researchTheme,
        techStack: mergedSnapshot.techStack,
        targetRole: mergedSnapshot.targetRole,
      });
    } catch (e) {
      console.error("OpenAI first question error:", e);
      firstQuestion = "まず研究テーマを3分で説明してください。";
    }

    return c.json({
      interviewId: interview.id,
      firstQuestion,
    });
  })
  .post("/api/interviews/:id/finish", async (c) => {
    const userId = c.get("userId");
    const interviewId = c.req.param("id");
    const supabase = createSupabaseClient(c.env);

    let { data: interview, error: interviewError } = await supabase
      .from("interviews")
      .select("id, user_id, status, profile_snapshot")
      .eq("id", interviewId)
      .eq("user_id", userId)
      .single();
    if (interviewError && (interviewError as { code?: string }).code === "PGRST204") {
      // profile_snapshot 列が無い環境向け互換
      ({ data: interview, error: interviewError } = await supabase
        .from("interviews")
        .select("id, user_id, status")
        .eq("id", interviewId)
        .eq("user_id", userId)
        .single());
    }

    if (interviewError || !interview) {
      return c.json({ error: "Interview not found or access denied" }, 404);
    }
    if (interview.status !== "active") {
      return c.json({ error: "Interview already finished or aborted" }, 409);
    }

    const { data: messageRows } = await supabase
      .from("messages")
      .select("role, content")
      .eq("interview_id", interviewId)
      .order("created_at", { ascending: true });

    const conversationLog = (messageRows ?? [])
      .map((r) => `${r.role}: ${r.content}`)
      .join("\n");
    if (!conversationLog.trim()) {
      return c.json({ error: "No messages to evaluate" }, 400);
    }

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

    const targetRole =
      (interview as { profile_snapshot?: unknown }).profile_snapshot &&
      typeof (interview as { profile_snapshot?: unknown }).profile_snapshot === "object" &&
      "targetRole" in ((interview as { profile_snapshot?: unknown }).profile_snapshot as Record<string, unknown>) &&
      typeof ((interview as { profile_snapshot?: unknown }).profile_snapshot as Record<string, unknown>).targetRole === "string"
        ? (((interview as { profile_snapshot?: unknown }).profile_snapshot as Record<string, unknown>).targetRole as string)
        : undefined;

    const evaluation = await getEvaluation(
      c.env,
      conversationLog,
      recentWeaknessTags,
      targetRole
    );
    if (!evaluation) {
      return c.json(
        { error: "Failed to generate evaluation" },
        500
      );
    }

    const { error: evalInsertError } = await supabase.from("evaluations").insert({
      interview_id: interviewId,
      score_logic: evaluation.logic,
      score_accuracy: evaluation.accuracy,
      score_clarity: evaluation.clarity,
      score_keigo: evaluation.keigo,
      score_specificity: evaluation.specificity,
      strengths: evaluation.strengths,
      weaknesses: evaluation.weaknesses,
      next_actions: evaluation.nextActions,
      summary: evaluation.summary,
    });
    if (evalInsertError) {
      console.error("evaluations insert error:", evalInsertError);
      return c.json({ error: "Failed to save evaluation" }, 500);
    }

    const { error: updateError } = await supabase
      .from("interviews")
      .update({ status: "finished", ended_at: new Date().toISOString() })
      .eq("id", interviewId)
      .eq("user_id", userId);
    if (updateError) {
      console.error("interviews update error:", updateError);
      return c.json({ error: "Failed to update interview status" }, 500);
    }

    return c.json({ evaluation });
  });
