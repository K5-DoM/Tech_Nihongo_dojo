// scripts/mint-test-jwt.mjs
// ローカルで /api/me を試すためのテスト JWT 発行。SUPABASE_JWT_SECRET は .dev.vars と一致させること。
// 本番の秘密鍵では実行しないこと。開発・ローカル専用。
import * as jose from "jose";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devVarsPath = path.join(__dirname, "..", ".dev.vars");

if (process.env.NODE_ENV === "production" && !process.env.SUPABASE_JWT_SECRET) {
  console.error("本番では .dev.vars を読まないため、SUPABASE_JWT_SECRET を環境変数で渡してください。このスクリプトは開発・ローカル専用です。");
  process.exit(1);
}

if (!process.env.SUPABASE_JWT_SECRET && process.env.NODE_ENV !== "production" && existsSync(devVarsPath)) {
  const content = readFileSync(devVarsPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.replace(/#.*/, "").trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

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