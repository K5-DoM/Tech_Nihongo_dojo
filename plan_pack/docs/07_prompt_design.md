# 07. プロンプト設計

## 7.1 設計原則
1. 役割固定（理系面接官）
2. 出力固定（JSONスキーマ）
3. 安全固定（断定回避・提案形式）
4. 履歴活用（弱点再提示）

## 7.2 システムプロンプト（要約）
- あなたは日本のIT企業の面接官
- 相手はN2〜N1の理系留学生
- 技術矛盾・敬語・わかりやすさを評価
- 会話の流れを壊さず、必要最小限の修正を示す
- 返答は必ずJSON

## 7.3 JSONスキーマ
```json
{
  "type": "object",
  "required": ["message", "correction", "is_finished", "weakness_tags"],
  "properties": {
    "message": { "type": "string" },
    "correction": { "type": "string" },
    "is_finished": { "type": "boolean" },
    "weakness_tags": {
      "type": "array",
      "items": { "type": "string" },
      "maxItems": 3
    }
  },
  "additionalProperties": false
}
```

## 7.4 弱点タグ例
- `keigo_casual`
- `too_abstract`
- `missing_result`
- `logic_jump`
- `overclaim`

## 7.5 評価時プロンプト（POST /api/interviews/:id/finish）
入力:
- **会話ログ**: 当該セッションの `messages` を `role: content` の形式で1行ずつ連結した文字列（MVP では全文を渡し、長い場合は LLM の max_tokens で切り詰め）
- **直近弱点タグ**: 同一ユーザーの `weakness_history` を `last_seen_at` 降順で最大10件取得し、タグの重複を除いた配列
- **目標職種**: 未設定の場合は「（未設定）」として渡す

出力（Structured Output: evaluationSchema）:
- **5軸スコア**: logic, accuracy, clarity, keigo, specificity（各 1-5）
- **strengths** / **weaknesses** / **nextActions**: それぞれ文字列配列。nextActions は行動ベースで最大3つ
- **summary**: 120字程度の日本語サマリ

パース失敗時は1回リトライ。それでも失敗時は API は 500 を返す。

## 7.6 品質担保
- JSON parse失敗時リトライ1回
- 失敗時フォールバックテンプレ
- 高温度設定禁止（0.2〜0.5）
