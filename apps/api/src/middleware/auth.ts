import { createMiddleware } from "hono/factory";
import * as jose from "jose";

const AUTH_HEADER = "Authorization";
const BEARER_PREFIX = "Bearer ";

export type AuthEnv = {
  SUPABASE_JWT_SECRET: string;
  SUPABASE_URL?: string;
};

export type AuthVariables = {
  userId: string;
};

/**
 * JWT のヘッダーだけデコード（検証しない）。alg 判定用。
 */
function decodeHeader(token: string): { alg?: string } {
  const parts = token.split(".");
  if (parts.length < 2) return {};
  try {
    const header = JSON.parse(
      new TextDecoder().decode(
        base64UrlDecode(parts[0])
      )
    ) as { alg?: string };
    return header;
  } catch {
    return {};
  }
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Bearer JWT（Supabase Auth）を検証し、未認証なら 401 を返す。
 * HS256（Legacy JWT Secret）と RS256（JWT Signing Keys / JWKS）の両方に対応。
 * 検証成功時は c.set("userId", sub) でコンテキストにユーザーIDをセット。
 */
export const requireAuth = createMiddleware<{
  Bindings: AuthEnv;
  Variables: AuthVariables;
}>(async (c, next) => {
  const secret = c.env.SUPABASE_JWT_SECRET;
  const supabaseUrl = c.env.SUPABASE_URL?.replace(/\/$/, "");
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

  const header = decodeHeader(token);
  const alg = header.alg ?? "HS256";

  try {
    let payload: jose.JWTPayload;
    if (alg === "HS256") {
      const key = new TextEncoder().encode(secret);
      const result = await jose.jwtVerify(token, key, {
        algorithms: ["HS256"],
      });
      payload = result.payload;
    } else if ((alg === "RS256" || alg === "ES256") && supabaseUrl) {
      const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
      const jwks = jose.createRemoteJWKSet(new URL(jwksUrl));
      const result = await jose.jwtVerify(token, jwks, {
        algorithms: ["RS256", "ES256"],
      });
      payload = result.payload;
    } else {
      console.error("[auth] JWT verify failed: unsupported alg", alg);
      return c.json({ error: "Invalid or expired token" }, 401);
    }

    const sub = payload.sub;
    if (!sub) {
      return c.json({ error: "Invalid token payload" }, 401);
    }
    c.set("userId", sub);
    await next();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auth] JWT verify failed:", msg);
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});
