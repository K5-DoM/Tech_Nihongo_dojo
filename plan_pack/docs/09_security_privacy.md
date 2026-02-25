# 09. セキュリティ・プライバシー設計

**Supabase のキー・JWT の弁別**（どのタブのどのキーをどこで使うか）は [supabase_keys_reference.md](supabase_keys_reference.md) にまとめている。API は Legacy JWT Secret で Bearer 検証、Legacy service_role（または Secret key）で DB 接続。

---

## 9.1 データ分類
- P1: 認証情報（JWT, user_id）
- P2: 面接会話ログ（準機微）
- P3: 課金イベント

## 9.2 セキュリティ要件
- RLS必須（ユーザー行隔離）
- Stripe webhook署名検証
- API key は Workers Secret 管理。Supabase は **Legacy JWT Secret**（Bearer 検証）と **Legacy service_role** または **Secret key**（DB 用）を使い分ける。詳細は [supabase_keys_reference.md](supabase_keys_reference.md)。
- ログに個人情報を出しすぎない

## 9.3 プライバシー要件
- 利用規約とプライバシーポリシー公開
- 「入力内容はAI処理に送信される」明示
- 機密情報入力禁止をUIで表示
- アカウント削除時のデータ削除導線

## 9.4 abuse対策
- レート制限（IP/user単位）
- 不適切入力の軽微フィルタ
- 通報導線

## 9.5 インシデント対応
- 重大障害時はトップに告知
- 課金不整合は手動付与フロー
- 復旧後に再発防止策を公開
