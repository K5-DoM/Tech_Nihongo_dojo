// scripts/mint-test-jwt.mjs
// ローカルで /api/me を試すためのテスト JWT 発行。SUPABASE_JWT_SECRET は .dev.vars と一致させること。
// 本番の秘密鍵では実行しないこと。
import * as jose from "jose";

const SECRET = process.env.SUPABASE_JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  console.error("SUPABASE_JWT_SECRET を設定してください（32文字以上）。例: apps/api/.dev.vars に記載するか、PowerShell で $env:SUPABASE_JWT_SECRET = \"...\"");
  process.exit(1);
}

const SUB = process.env.TEST_USER_ID || "00000000-0000-0000-0000-000000000001"; // テスト用ユーザーID

const secret = new TextEncoder().encode(SECRET);
const jwt = await new jose.SignJWT({})
  .setProtectedHeader({ alg: "HS256" })
  .setSubject(SUB)
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(secret);

console.log(jwt);