# Tech-Nihongo Dojo — 企画書・開発計画書パック

理系留学生向け「技術日本語」面接対策SaaS  
**コンセプト:** 単なるAIチャットではなく、**評価ルーブリック + 学習履歴 + 改善ループ**を提供するトレーニングシステム

---


## 想定技術スタック（MVP）

- Frontend: React + Vite + TypeScript + Tailwind + shadcn/ui
- Backend: Hono on Cloudflare Workers
- DB/Auth: Supabase (PostgreSQL + RLS + Auth)
- AI: OpenAI API（Structured Outputs）
- Billing: Stripe Checkout + Webhook
- Observability: Cloudflare logs + Sentry（任意）

---

## 開発開始前チェック

1. Supabaseプロジェクト作成
2. Cloudflare Workers/Pagesプロジェクト作成
3. Stripeテスト環境設定
4. OpenAI APIキー設定
5. `.env.example` を `.env.local` にコピーして値を埋める

---

## 免責

本プロダクトは学習支援ツールであり、採用結果を保証しません。  
機微情報・機密情報の入力は禁止します。
