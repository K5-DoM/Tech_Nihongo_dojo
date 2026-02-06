# 02_chat_api_structured_output.md
`POST /api/chat` を実装してください。

## 入力
- interviewId: string
- userMessage: string

## 要件
- OpenAI Structured Outputsを利用
- 出力JSONは以下に完全一致:
{
  "message": string,
  "correction": string,
  "is_finished": boolean,
  "weakness_tags": string[]
}
- JSON parse失敗時は1回だけリトライ
- 結果を `messages` に保存
- weakness_tags を weakness_history にupsert

## 受け入れ条件
- 型エラーなし
- 正常系/異常系テストを最低2件ずつ
