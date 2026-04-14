# Phase 1 Week 2 振り返り（反省点・環境差のメモ）

## 概要

Phase 1 Week 2 の実装・単体テスト追加において発生したエラーと、**実装起因**か**環境・権限の差起因**かを整理したドキュメントです。

---

## 1. 発生した事象と原因の分類

### 1.1 単体テスト失敗「body が JSON でないと 400」

| 事象 | 期待 | 実際 |
|------|------|------|
| 不正な JSON  body（例: `"invalid json"`）で POST /api/chat を送る | 400 Bad Request | 500 Internal Server Error |

**原因**: **実装側**  
- `c.req.json()` が不正 JSON のときに例外を投げており、ルート内で catch していなかった。  
- そのため Zod の `safeParse` に到達する前に未処理例外となり 500 になっていた。

**対応**:  
- `apps/api/src/routes/chat.ts` と `interviews.ts` で、body 取得を try/catch で囲み、`c.req.json()` のパース失敗時は 400 と `{ error: "Invalid JSON body" }` を返すように修正。

---

### 1.2 テスト実行環境まわり（Agent 側でテストが通らない）

| 事象 | 原因の分類 |
|------|------------|
| `pnpm install` が TTY なしで中断される（`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`） | **環境・権限**（CI/非対話環境の挙動） |
| `pnpm install` で `ERR_PNPM_OUTDATED_LOCKFILE`（vitest 追加で lockfile 不一致） | **環境・権限**（CI 時の frozen-lockfile がデフォルト） |
| `vitest run` で「vitest は内部コマンドまたはバッチファイルとして認識されません」 | **環境・権限**（Agent 実行環境に node_modules が無い／別状態） |
| `pnpm test` 実行時に `spawn EPERM`（esbuild 等） | **環境・権限**（サンドボックスや実行権限の制限） |

**対応**:  
- 実装はそのままに、**手元のターミナル**で `pnpm install` および `pnpm test` を実行してもらう前提にした。  
- `phase1_week2_impl_plan.md` に「単体テストの実行（手元のみ）」として手順を追記。  
- ルートに `pnpm test` スクリプトを追加し、手元で一括実行しやすくした。

---

## 2. 環境・権限の差の整理（Agent 側 vs 手元）

| 項目 | Agent 側（Cursor 実行環境） | 手元（開発者環境） |
|------|-----------------------------|---------------------|
| `pnpm install` | 非対話・CI 的挙動になりやすく、lockfile 更新や node_modules 再作成で失敗・タイムアウトしやすい | 通常どおり実行可能 |
| `node_modules` | サンドボックスや永続化の都合で無い／古い状態になりやすい | インストール結果がそのまま残る |
| `pnpm test` / `vitest run` | 上記のため「コマンドが見つからない」や EPERM で失敗しやすい | 依存が入っていればそのまま実行可能 |
| ファイル編集・コミット | 可能（リポジトリ内の編集） | 可能 |

**まとめ**:  
- **実装不備（JSON パースで 500）** → Agent 側でコード修正して対応。  
- **テストの実行・インストールの成功** → 主に手元の環境・権限で実施する前提とするのが現実的。

---

## 3. 今後の注意点・推奨

1. **API の body パース**  
   - `c.req.json()` は不正 JSON で例外を投げるため、**JSON を扱うルートでは try/catch し、失敗時は 400 を返す**ようにする。

2. **単体テストの実行**  
   - 新規パッケージ追加（vitest 等）後は、**手元で `pnpm install`（必要なら `--no-frozen-lockfile`）を実行**してから `pnpm test` する。  
   - CI でテストを回す場合は、lockfile を事前に更新してコミットしておく。

3. **Agent に任せる範囲**  
   - コード・ドキュメントの編集、テスト**コード**の追加は Agent で実施。  
   - **実際の `pnpm install` / `pnpm test` の成功確認**は、手元で行う前提にするとよい。

4. **振り返りの残し方**  
   - 実装起因の不具合はコードで修正し、必要なら本ドキュメントのような「原因が実装か環境か」を短くメモしておくと、次フェーズで同じパターンを避けやすい。
