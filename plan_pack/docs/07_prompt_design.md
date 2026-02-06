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

## 7.5 評価時プロンプト
入力:
- 会話ログ（要約）
- 直近3回の弱点タグ
- 目標職種

出力:
- 5軸スコア（1-5）
- strengths / weaknesses / nextActions
- 120字程度サマリ

## 7.6 品質担保
- JSON parse失敗時リトライ1回
- 失敗時フォールバックテンプレ
- 高温度設定禁止（0.2〜0.5）
