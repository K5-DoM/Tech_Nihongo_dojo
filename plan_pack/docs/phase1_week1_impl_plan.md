# Phase 1 Week 1 実装計画

## 参照仕様
- 02_prd.md, 04_architecture.md, 05_db_schema.sql, 06_api_contracts.md
- 03_dev_plan.md Phase 1 Week 1

## Week 1 スコープ
- リポジトリ初期化（monorepo）
- Cloudflare Workers + Hono 雛形
- Supabase 接続 / Auth 導入

## ファイル構成（完了後）

```
Tech_Nihongo_dojo/
├── package.json              # workspaces root
├── pnpm-workspace.yaml
├── tsconfig.json             # base
├── .gitignore
├── .env.example              # 既存
├── apps/
│   └── api/
│       ├── package.json
│       ├── wrangler.toml
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts           # Hono app, /api/*
│           ├── middleware/
│           │   └── auth.ts        # JWT 検証
│           └── lib/
│               └── supabase.ts    # Supabase server client
└── packages/
    └── shared/
        ├── package.json
        ├── tsconfig.json
        └── src/
            └── index.ts
```

- **apps/web** は Week 2「最小チャットUI実装」で追加する。

## コミット単位の手順

| # | コミットメッセージ | 内容 |
|---|--------------------|------|
| 1 | chore: monorepo root and pnpm workspace | ルート package.json, pnpm-workspace.yaml, tsconfig.json, .gitignore 更新 |
| 2 | feat(packages): add shared package | packages/shared の package.json, tsconfig, src/index.ts |
| 3 | feat(api): Hono app on Cloudflare Workers | apps/api 雛形、GET /api/health |
| 4 | feat(api): Supabase server client and env bindings | apps/api 内 supabase.ts, wrangler 環境変数 |
| 5 | feat(api): JWT auth middleware for /api/* | Bearer 検証、未認証 401 |

## 技術メモ
- 認証: 06_api_contracts.md に従い Bearer JWT（Supabase Auth）、未認証は 401。
- API ベースパス: `/api/*`。
- Supabase: サーバー側は SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY。JWT 検証は SUPABASE_JWT_SECRET で検証。

---

## コミット実行例（任意）

作業ツリーを 5 つのコミットに分ける場合の例。ルートで実行。

```bash
# 1
git add package.json pnpm-workspace.yaml tsconfig.json .gitignore
git commit -m "chore: monorepo root and pnpm workspace"

# 2
git add packages/
git commit -m "feat(packages): add shared package"

# 3
git add apps/api/package.json apps/api/wrangler.toml apps/api/tsconfig.json apps/api/src/index.ts
git commit -m "feat(api): Hono app on Cloudflare Workers"

# 4
git add apps/api/src/lib/supabase.ts apps/api/wrangler.toml apps/api/package.json apps/api/src/index.ts
git commit -m "feat(api): Supabase server client and env bindings"

# 5
git add apps/api/src/middleware/auth.ts apps/api/src/index.ts apps/api/package.json
git commit -m "feat(api): JWT auth middleware for /api/*"
```

※ 実装は一括で入っているため、上記は「分けてコミットする場合」の参考。まとめて 1 コミットでも可。

---

## テスト JWT 発行（/api/me 確認用）

`apps/api/scripts/mint-test-jwt.mjs` は Node で実行するため、**Wrangler 専用の .dev.vars は読まれない**（.dev.vars は `wrangler dev` が Worker に渡すだけ）。スクリプトは `process.env.SUPABASE_JWT_SECRET` を見るので、シェルで環境変数を渡してから実行する。

**方法1（推奨）**

1. `apps/api` に移動する。
2. `.dev.vars` に書いた `SUPABASE_JWT_SECRET` の値を、PowerShell の環境変数に設定する。
3. スクリプトを実行する。

```powershell
cd apps/api
$env:SUPABASE_JWT_SECRET = "（.dev.vars に書いたのと同じ32文字以上の文字列）"
pnpm exec node scripts/mint-test-jwt.mjs
```

表示された JWT を `Authorization: Bearer <JWT>` で `GET http://127.0.0.1:8787/api/me` に付けて送ると 200 と `userId` が返る。
