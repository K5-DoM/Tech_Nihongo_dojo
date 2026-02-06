import { createMiddleware } from "hono/factory";
import * as jose from "jose";

const AUTH_HEADER = "Authorization";
const BEARER_PREFIX = "Bearer ";

export type AuthEnv = {
  SUPABASE_JWT_SECRET: string;
};

export type AuthVariables = {
  userId: string;
};

/**
 * Bearer JWT（Supabase Auth）を検証し、未認証なら 401 を返す。
 * 検証成功時は c.set("userId", sub) でコンテキストにユーザーIDをセット。
 */
export const requireAuth = createMiddleware<{
  Bindings: AuthEnv;
  Variables: AuthVariables;
}>(async (c, next) => {
  const secret = c.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return c.json({ error: "Auth not configured" }, 500);
  }

  const authHeader = c.req.header(AUTH_HEADER);
  if (!authHeader?.startsWith(BEARER_PREFIX)) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(BEARER_PREFIX.length).trim();
  if (!token) {
    return c.json({ error: "Missing token" }, 401);
  }

  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jose.jwtVerify(token, key, {
      algorithms: ["HS256"],
    });
    const sub = payload.sub;
    if (!sub) {
      return c.json({ error: "Invalid token payload" }, 401);
    }
    c.set("userId", sub);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});
