# Tech-Nihongo Dojo — 企画書・開発計画書パック

理系留学生向け「技術日本語」面接対策SaaS  
**コンセプト:** 単なるAIチャットではなく、**評価ルーブリック + 学習履歴 + 改善ループ**を提供するトレーニングシステム

---

## このリポジトリの目的

- GitHubでそのまま公開できる**正式な企画書・開発計画書**
- Cursorにそのまま投入できる**実装プロンプト集**
- 3か月でMVP〜初期収益化まで進めるための**運用可能な実行計画**

---

## ドキュメント構成

- `docs/01_project_charter.md`：プロジェクト憲章（目的・範囲・制約）
- `docs/02_prd.md`：PRD（要件定義）
- `docs/03_dev_plan.md`：12週間の開発計画
- `docs/04_architecture.md`：アーキテクチャ設計
- `docs/05_db_schema.sql`：DBスキーマ（Supabase PostgreSQL）
- `docs/06_api_contracts.md`：API仕様（Hono）
- `docs/07_prompt_design.md`：LLMプロンプト設計
- `docs/08_evaluation_rubric.md`：5軸評価ルーブリック
- `docs/09_security_privacy.md`：セキュリティ/プライバシー設計
- `docs/10_kpi_experiment_plan.md`：KPIと検証計画
- `docs/11_release_plan.md`：リリース計画
- `docs/12_ops_runbook.md`：運用Runbook
- `docs/13_risk_register.md`：リスク登録簿
- `docs/14_monetization.md`：収益モデル詳細

---

## Cursorプロンプト集

- `cursor_prompts/01_bootstrap.md`
- `cursor_prompts/02_chat_api_structured_output.md`
- `cursor_prompts/03_supabase_rls.md`
- `cursor_prompts/04_stripe_checkout_webhook.md`
- `cursor_prompts/05_eval_report_generator.md`
- `cursor_prompts/06_e2e_test_plan.md`

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
