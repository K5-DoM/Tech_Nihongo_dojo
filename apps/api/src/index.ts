import { Hono } from "hono";
import type { SupabaseEnv } from "./lib/supabase";
import { requireAuth } from "./middleware/auth";

type Bindings = SupabaseEnv & {
  SUPABASE_JWT_SECRET?: string;
};

type Variables = { userId: string };

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ルート: localhost:8787 で開いたときの表示（認証不要）
app.get("/", (c) => {
  return c.json({
    name: "Tech Nihongo Dojo API",
    health: "/api/health",
    docs: "plan_pack/docs/06_api_contracts.md",
  });
});

// 死活監視用（認証不要）
app.get("/api/health", (c) => {
  return c.json({ ok: true, timestamp: new Date().toISOString() });
});

// 認証必須の API ルート（06_api_contracts: Bearer JWT、未認証は 401）
const api = new Hono<{ Bindings: Bindings; Variables: Variables }>()
  .use("*", requireAuth);

api.get("/api/me", (c) => {
  const userId = c.get("userId");
  return c.json({ userId });
});

app.route("/", api);

export default app;
