# Supabase ダッシュボードのキー・JWT の弁別と本プロジェクトでの使い方

Supabase の **Project Settings → API** および **Project Settings → JWT** には、キーが複数種類・複数タブに分かれています。どれをどこで使うかを明確にします。

---

## 1. API Keys（Project Settings → API）

ダッシュボードでは **2 種類のタブ** があります。

| タブ名 | キー | 形式 | 権限 | 用途 |
|--------|------|------|------|------|
| **Publishable and secret API keys** | Publishable key | `sb_publishable_...` | 低（クライアント向け） | ブラウザ・モバイル・CLI などに露出してよい。RLS で保護。 |
| ↑ 同上 | Secret key | `sb_secret_...` | 高（サーバー向け） | バックエンド・Edge Functions のみ。RLS をバイパス。 |
| **Legacy anon, service_role API keys** | anon | `eyJ...`（JWT） | 低（クライアント向け） | Publishable と同等。従来型。 |
| ↑ 同上 | service_role | `eyJ...`（JWT） | 高（サーバー向け） | Secret と同等。従来型。DB 接続に使用可能。 |

- **本プロジェクトで API（バックエンド）が使うもの**: **Legacy の service_role** を `SUPABASE_SERVICE_ROLE_KEY` に設定しています（`createSupabaseClient` で DB アクセスに使用）。新形式の **Secret key**（`sb_secret_...`）に差し替えても動作上は同等ですが、基本的にはLegacyを用います。
- **トークン取得（開発用）で使うもの**: Supabase Auth の `/auth/v1/token` を呼ぶときの `apikey` ヘッダーには、**Legacy の anon** を使います。 **Publishable key** も使用は可能。レスポンスの `access_token` は **Legacy JWT Secret** で署名されています（下記 2 節）。

---

## 2. JWT Keys（Project Settings → JWT）

ダッシュボードでは **2 種類のタブ** があります。

| タブ名 | 内容 | 本プロジェクトでの使用 |
|--------|------|------------------------|
| **JWT Signing Keys** | 新方式。非対称鍵（RS256/ES256）や共有秘密鍵。JWKS で検証可能。 | **使用していません**。将来 Supabase がユーザートークンをこちらで署名するように移行した場合は、API の検証ロジックを JWKS 対応に変更する必要があります。 |
| **Legacy JWT Secret** | 従来の 1 つの共有秘密鍵（HS256）。anon/service_role の JWT および **ユーザーの access_token** の署名に使用。 | **使用しています**。API の `SUPABASE_JWT_SECRET` には、ここに表示されている **Legacy JWT Secret** の値をそのまま設定します。Bearer トークン（`access_token`）の検証に必須です。 |

- 現在、Supabase Auth が `/auth/v1/token` で返す **access_token** は **Legacy JWT Secret** で署名されています。そのため API 側では `jose.jwtVerify(token, key, { algorithms: ["HS256"] })` で検証し、`SUPABASE_JWT_SECRET` には **Legacy JWT Secret** を設定する必要があります。
- **JWT Signing Keys** は、Legacy から移行する際の新方式です。本プロジェクトは現時点で Legacy JWT Secret のみ使用しています。

---

## 3. 本プロジェクトでの対応表（コピー用）

| 環境変数（apps/api） | Supabase ダッシュボードの取得場所 | 備考 |
|----------------------|-------------------------------------|------|
| `SUPABASE_URL` | Project Settings → API → **Project URL** | 全タブ共通。例: `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → **Legacy anon, service_role API keys** → **service_role** | Publishable and secret の **Secret key**（`sb_secret_...`）でも可。 |
| `SUPABASE_JWT_SECRET` | Project Settings → **JWT** → **Legacy JWT Secret** タブ → **JWT Secret** | 「Reveal」で表示。前後の改行・スペースを入れずにコピーすること。 |

**開発用にトークン取得するとき**（curl / PowerShell など）の `apikey` ヘッダー:

| 使うキー | 取得場所 |
|----------|----------|
| **Legacy の anon**（推奨: Auth との相性） | Project Settings → API → **Legacy anon, service_role API keys** → **anon**（`eyJ...` で始まる長い文字列） |
| Publishable keyに差し替えも可 | Project Settings → API → **Publishable and secret API keys** → **Publishable key**（`sb_publishable_...`） |

---

## 4. 混同しやすいポイント

- **anon** と **Publishable key** はどちらも「クライアント向けの低権限キー」ですが、**形式が違います**（anon は JWT `eyJ...`、Publishable は `sb_publishable_...`）。トークン取得の `apikey` にはどちらでも動きますが、本ドキュメントでは Legacy の **anon** を明示しています。
- **SUPABASE_JWT_SECRET** は **JWT Secret（Legacy）** であり、**anon key でも service_role key でもありません**。JWT の「署名用の秘密鍵」です。API が Bearer トークンを検証するときにだけ使います。
- **JWT Signing Keys** タブの鍵は、現状の当プロジェクトでは使っていません。Legacy JWT Secret のみ使用しています。

---

## 5. 関連ドキュメント

- 開発用 JWT 発行手順（mint スクリプトの使い方）: [dev_auth_jwt.md](dev_auth_jwt.md)
- API の環境変数テンプレート: [apps/api/.dev.vars.example](../../apps/api/.dev.vars.example)
- セキュリティ要件（API key 管理・RLS）: [09_security_privacy.md](09_security_privacy.md)
