# 開発用 JWT 発行手順

ローカルで `/api/me` や認証付き API を試すために、テスト用 JWT を発行する手順です。

---

## 推奨手順

開発時はスクリプトが `apps/api/.dev.vars` を自動読み込みするため、環境変数の手動設定は不要です。`.dev.vars` に `SUPABASE_JWT_SECRET` と `TEST_USER_ID`（任意。開発者の Supabase Auth ユーザーUUID を入れるとその開発者として試せる）を設定したうえで、以下を実行します。

```bash
cd apps/api
pnpm exec node scripts/mint-test-jwt.mjs
```

表示された JWT を `Authorization: Bearer <JWT>` で `GET http://127.0.0.1:8787/api/me` に付けて送ると 200 と `userId` が返ります。

---

## 運用上の注意

- このスクリプトは**開発・ローカル専用**です。本番の `SUPABASE_JWT_SECRET` では実行しないでください。
- 開発者の Supabase ユーザーUUID は、Supabase Dashboard の **Authentication → Users** で確認できます。

---

## 代替: 環境変数で渡す場合

CI や .dev.vars を使いたくない場合は、シェルで環境変数を設定してから実行します。

**PowerShell の例:**

```powershell
cd apps/api
$env:SUPABASE_JWT_SECRET = "（.dev.vars に書いたのと同じ32文字以上の文字列）"
pnpm exec node scripts/mint-test-jwt.mjs
```

---

## 関連ドキュメント

- キー・JWT の取り方（Supabase のタブ区別）: [supabase_keys_reference.md](supabase_keys_reference.md)
- 環境変数テンプレート: [apps/api/.dev.vars.example](../../apps/api/.dev.vars.example)
