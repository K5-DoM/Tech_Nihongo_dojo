# 04. アーキテクチャ設計

## 4.1 システム構成

```text
[Browser SPA]
   |
   | HTTPS
   v
[Cloudflare Workers + Hono API]
   |                     \
   |                      \-> [OpenAI API]
   v
[Supabase Postgres/Auth]
   |
   v
[Stripe Webhook -> Hono]
```

## 4.2 コンポーネント
- `apps/web`: React + Vite
- `apps/api`: Hono (Cloudflare Workers)
- `packages/shared`: zod schema / 型定義 / util

## 4.3 認証
- Supabase Auth（Email + OAuthは任意）
- JWT検証をAPI側で実施
- RLSでユーザー行のみアクセス可

## 4.4 データフロー
1. ユーザーが回答送信
2. APIが会話文脈 + ユーザープロフィール + 弱点タグを構成
3. OpenAIへ送信（Structured Output）
4. 結果をDB保存
5. UIへレスポンス（面接官発話 + 指摘 + セッション状態）

## 4.5 失敗時挙動
- JSON不正時：1回リトライ + フォールバック文面
- OpenAI timeout：ユーザーに再試行導線
- Stripe webhook失敗：イベント再処理キュー

## 4.6 スケーリング戦略（将来）
- OpenAI呼び出し回数抑制（要約圧縮）
- 成果物生成を非同期キュー化
- 高負荷時はレート制限 + 待機キュー表示
