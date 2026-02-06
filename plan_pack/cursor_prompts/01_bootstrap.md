# 01_bootstrap.md
以下を満たすmonorepoを作成してください。

## 目的
Cloudflare Workers(Hono) + React(Vite) + TypeScript で、型安全API連携できる土台を作る。

## 要件
- apps/web: React + Vite + Tailwind
- apps/api: Hono (Cloudflare Workers)
- packages/shared: zod schema + 型
- pnpm workspace
- biome/eslintの最低限設定
- `.env.example` を生成

## 出力
1. ディレクトリ構成
2. 初期コード
3. ローカル起動手順
4. デプロイ手順（Cloudflare）
