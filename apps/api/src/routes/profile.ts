import { z } from "zod";
import { Hono } from "hono";
import { createSupabaseClient, type SupabaseEnv } from "../lib/supabase";

const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    major: z.string().trim().min(1).max(120).optional(),
    researchTheme: z.string().trim().min(1).max(200).optional(),
    techStack: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
    targetRole: z.string().trim().min(1).max(120).optional(),
    targetCompanyType: z.string().trim().min(1).max(120).optional(),
    jpLevel: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

type Env = SupabaseEnv;
type Variables = { userId: string };

export const profileRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get("/api/profile", async (c) => {
    const userId = c.get("userId");
    const supabase = createSupabaseClient(c.env);

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, display_name, major, research_theme, tech_stack, target_role, target_company_type, jp_level, updated_at"
      )
      .eq("id", userId)
      .single();

    if (error) {
      // 新規ユーザーなどで row がない場合は空プロフィールを返す（interviews 側で upsert 済みでも、タイミング差を許容）
      return c.json({ profile: {} });
    }

    return c.json({
      profile: {
        displayName: data.display_name ?? undefined,
        major: data.major ?? undefined,
        researchTheme: data.research_theme ?? undefined,
        techStack: data.tech_stack ?? undefined,
        targetRole: data.target_role ?? undefined,
        targetCompanyType: data.target_company_type ?? undefined,
        jpLevel: data.jp_level ?? undefined,
        updatedAt: data.updated_at,
      },
    });
  })
  .put("/api/profile", async (c) => {
    const userId = c.get("userId");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const parseResult = profileUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      return c.json({ error: "Invalid request body", details: parseResult.error.flatten() }, 400);
    }

    const supabase = createSupabaseClient(c.env);
    const p = parseResult.data;

    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          display_name: p.displayName,
          major: p.major,
          research_theme: p.researchTheme,
          tech_stack: p.techStack,
          target_role: p.targetRole,
          target_company_type: p.targetCompanyType,
          jp_level: p.jpLevel,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select(
        "id, display_name, major, research_theme, tech_stack, target_role, target_company_type, jp_level, updated_at"
      )
      .single();

    if (error || !data) {
      console.error("profile upsert error:", error);
      return c.json({ error: "Failed to update profile" }, 500);
    }

    return c.json({
      profile: {
        displayName: data.display_name ?? undefined,
        major: data.major ?? undefined,
        researchTheme: data.research_theme ?? undefined,
        techStack: data.tech_stack ?? undefined,
        targetRole: data.target_role ?? undefined,
        targetCompanyType: data.target_company_type ?? undefined,
        jpLevel: data.jp_level ?? undefined,
        updatedAt: data.updated_at,
      },
    });
  });

