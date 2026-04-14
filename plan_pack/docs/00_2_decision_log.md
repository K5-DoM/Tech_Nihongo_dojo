# 00_2. 意思決定ログ（Decision Log）

既存の主要判断を再解釈・検討し、表形式で記録する。今後の実装判断の参照用。

---

| 領域 | 選択肢 | 採用理由 | 比較案 | リスク | 見直し条件 |
|------|-------------------------------|------------------------|--------------------|--------|------------|
| **ランタイム** | Cloudflare Workers + Hono | エッジ・低レイテンシ・個人開発で無料枠が使いやすい | Vercel/Netlify Functions, 常時サーバー | ベンダー依存・Cold start | 原価が増大したら課金モデルと一緒に見直し |
| **BFF/API** | Hono で API を一元化 | 軽量・型安全・Workers と相性が良い | Express, tRPC | エコシステムが Express より小さい | チーム規模が増えたら再検討 |
| **フロント** | React + Vite (apps/web) | 標準的・ビルドが速い・SPA で十分 | Next.js, Remix | SSR/SEO は未対応（MVP は認証前提で許容） | 公開ランディングで SEO が必要になったら検討 |
| **認証** | Supabase Auth + Bearer JWT | RLS と組み合わせやすく、個人開発で管理コストが低い | Auth0, Cognito, 自前 | プロバイダ依存 | エンタープライズ需要が出たら検討 |
| **API 認証** | 全 /api/* を requireAuth で保護 | 漏れを防ぎやすい | ルートごと個別 | 開発時は JWT 手入力が必要 | 本番では Supabase ログイン UI で解消 |
| **チャット応答形式** | Structured Output（Zod + OpenAI parse） | 評価・弱点タグを確実に JSON で取得できる | 自由文 + 後処理パース | パース失敗時はリトライ・フォールバックが必要 | 失敗率が Gate を超えたらプロンプト/モデル見直し |
| **弱点履歴** | ターンごとに weakness_tags を DB に upsert | 次回以降の質問方針・再提示に使える資産になる | セッション終了時のみ保存 | 同一タグの重複・ノイズの可能性 | 次回質問への反映（プロンプト注入）を実装後に効果測定 |
| **5軸評価** | セッション終了 API（/finish）で一括生成 | 会話全体を踏まえた一貫した評価が可能 | ターンごと評価 | 終了時 1 回の LLM コールで負荷集中 | 評価品質が Gate を満たさない場合はプロンプト分割を検討 |
| **課金** | Stripe Checkout + Webhook でチケット加算 | 決済の信頼性・監査・個人開発で実装コストが低い | 自前決済・他プロバイダ | Webhook 冪等・署名検証必須 | 規約・免責を整えた上で β 投入 |
| **開発用認証** | フロントで JWT を手入力・localStorage 保存 | 実装が早い・Supabase Auth API でトークン取得 | 最初からログイン UI | 本番では使わない・セキュリティ注意 | Week 4 前後でログイン UI を入れる前提。キー・JWT の弁別: [supabase_keys_reference.md](supabase_keys_reference.md) |
| **Monorepo** | pnpm workspace (apps/web, apps/api, packages/shared) | 型・スキーマの共有が容易で、1 リポジトリで完結 | 別リポジトリ・Polyrepo | 依存更新の影響範囲が広い | スコープが大きく分かれたら分割検討 |
| **テスト** | 手元で pnpm test（API/Shared の単体テスト） | Agent 環境で EPERM・lockfile 等の差があり、手元実行が確実 | CI 必須にしない | コミット忘れでテスト未実行のリスク | CI を導入する場合は lockfile 更新をルール化 |
| **body パース** | try/catch で c.req.json() を囲み失敗時 400 | 不正 JSON で 500 を出さず、契約通りのエラーにできる | 例外をそのまま | なし | 新規 JSON 受付ルートでも同様に適用 |

---

## 補足（実装と設計のギャップで見直すもの）

- **弱点の次回反映**  
  Week 3 で実装済み。`getChatTurn` 呼び出し前に `weakness_history` を `last_seen_at` 降順で最大10件取得し、オプション `recentWeaknessTags` でシステムプロンプトに注入している。

- **5軸評価 API**  
  Week 3 で実装済み。`POST /api/interviews/:id/finish` で会話ログ・直近弱点を渡して評価を生成し、`evaluations` に保存。既に終了済みの場合は 409 を返す。

- **プロフィール入力**  
  F1（プロフィール設定）の UI が未実装。開始時に `profileSnapshot` を空で送れる状態。優先度を 03_dev_plan と合わせて決める（α 前に最小限入れるか、Gate A 通過後に回すか）。

- **JTC向け4週間方針**  
  就活ポートフォリオで「設計→実装→評価→運用」を最短で示すため、4週間は 15_jtc_portfolio_dev_policy を優先。課金・成果物生成は Could に回し、Must は認証/RLS・Structured Output 実運用・リトライ/フォールバック・DoD計測・CI・セキュリティ明文化に集中。
