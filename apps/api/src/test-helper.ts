import * as jose from "jose";

const TEST_JWT_SECRET = "test-secret-at-least-32-characters-long!!";

/**
 * テスト用の有効な JWT を発行する。env.SUPABASE_JWT_SECRET に同じ文字列を渡すこと。
 */
export async function mintTestJwt(sub = "00000000-0000-0000-0000-000000000001"): Promise<string> {
  const secret = new TextEncoder().encode(TEST_JWT_SECRET);
  return new jose.SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

/**
 * テスト用の Bindings。auth を通し、Supabase/OpenAI はダミー（実機未使用の 400 テスト用）。
 */
export const testEnv = {
  SUPABASE_JWT_SECRET: TEST_JWT_SECRET,
  SUPABASE_URL: "https://dummy.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "dummy-service-role-key",
  OPENAI_API_KEY: "sk-dummy",
};
