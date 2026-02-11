import { z } from "zod";
import { Hono } from "hono";
import { createSupabaseClient, type SupabaseEnv } from "../lib/supabase";
import { getFirstQuestion } from "../lib/openai";
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

type Env = SupabaseEnv & OpenAIEnv;
type Variables = { userId: string };

export const interviewsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()
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
    const { data: interview, error: insertError } = await supabase
      .from("interviews")
      .insert({
        user_id: userId,
        mode,
        status: "active",
      })
      .select("id")
      .single();

    if (insertError || !interview) {
      console.error("interviews insert error:", insertError);
      return c.json({ error: "Failed to create interview" }, 500);
    }

    let firstQuestion: string;
    try {
      firstQuestion = await getFirstQuestion(c.env, profileSnapshot);
    } catch (e) {
      console.error("OpenAI first question error:", e);
      firstQuestion = "まず研究テーマを1分で説明してください。";
    }

    return c.json({
      interviewId: interview.id,
      firstQuestion,
    });
  });
