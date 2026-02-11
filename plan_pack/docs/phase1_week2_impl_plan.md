# Phase 1 Week 2 実装計画

## 参照仕様
- 02_prd.md, 04_architecture.md, 05_db_schema.sql, 06_api_contracts.md
- 03_dev_plan.md Phase 1 Week 2
- 07_prompt_design.md, 08_evaluation_rubric.md
- cursor_prompts/02_chat_api_structured_output.md

## Week 2 スコープ
- `/api/chat` 実装（Structured Outputs）
- 5軸評価JSONスキーマ定義
- 最小チャットUI実装

## ファイル構成（完了後）

```
Tech_Nihongo_dojo/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── index.ts              # + POST /api/interviews, POST /api/chat
│   │       ├── routes/
│   │       │   ├── interviews.ts     # 新規: interviews 開始
│   │       │   └── chat.ts           # 新規: 1ターン進行
│   │       ├── lib/
│   │       │   ├── supabase.ts       # 既存
│   │       │   └── openai.ts         # 新規: Structured Output 呼び出し
│   │       └── middleware/
│   │           └── auth.ts           # 既存
│   └── web/                          # 新規アプリ
│       ├── package.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── api/
│           │   └── client.ts         # API 呼び出し
│           └── (最小チャット画面)
└── packages/
    └── shared/
        └── src/
            ├── index.ts              # 再export
            ├── schemas/
            │   ├── chat.ts           # 新規: チャット応答 Zod
            │   └── evaluation.ts     # 新規: 5軸評価 Zod
            └── (型 export)
```

## コミット単位の手順

| # | コミットメッセージ | 内容 |
|---|--------------------|------|
| 1 | feat(shared): add Zod schemas for chat response and 5-axis evaluation | packages/shared: chat 応答（message, correction, is_finished, weakness_tags）と 5軸評価（logic, accuracy, clarity, keigo, specificity, strengths, weaknesses, nextActions, summary）のスキーマ・型を追加 |
| 2 | feat(api): add POST /api/interviews | 面接開始: interviews 行作成、初回質問を返却（OpenAI または固定文）。要: OPENAI_API_KEY を .dev.vars に追加 |
| 3 | feat(api): add POST /api/chat with Structured Outputs and DB save | OpenAI Structured Outputs、JSON 失敗時 1 回リトライ、結果を messages に保存、weakness_tags を weakness_history に upsert |
| 4 | feat(web): add Vite+React app with minimal chat UI | apps/web 追加、面接開始→初回質問表示→ユーザー入力→送信→応答（message, correction, is_finished, weakness_tags）表示 |

## 依頼事項（こちらで実施が必要なもの）※済

- **環境変数**: `apps/api/.dev.vars` に `OPENAI_API_KEY=sk-...` を追加してください（API 実行に必須）。
- **Supabase**: Week 1 でマイグレーション済みであれば不要。未実施の場合は `plan_pack/docs/05_db_schema.sql` を Supabase の SQL Editor で実行してください。

## 技術メモ

- チャット応答スキーマ: 07_prompt_design.md の JSON スキーマに合わせる。`weakness_tags` は maxItems 3。
- 5軸評価スキーマ: 08_evaluation_rubric.md および 05_db_schema.sql の evaluations テーブルに合わせる。
- JSON parse 失敗時: 1 回だけリトライし、それでも失敗時はフォールバック文面を返す（04_architecture.md）。
- Web: 認証は仮で Bearer を固定 JWT にするか、ログイン画面は Week 2 では簡易扱い（開発用トークン入力など）を想定。
