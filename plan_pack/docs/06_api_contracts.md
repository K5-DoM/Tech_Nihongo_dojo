# 06. API仕様（Hono）

## Base
- `/api/*`

## 認証
- Bearer JWT（Supabase Auth）
- 未認証は 401

---

## GET `/api/interviews`
セッション一覧（認証必須、自分の interviews のみ）

### Query（任意）
- `limit`: 件数（省略時 20、最大 100）
- `offset`: オフセット（省略時 0）

### Response
```json
{
  "interviews": [
    {
      "id": "uuid",
      "started_at": "2025-02-16T10:00:00.000Z",
      "ended_at": "2025-02-16T10:15:00.000Z",
      "status": "finished",
      "summary": "評価サマリの先頭文字列（評価がない場合は null）"
    }
  ]
}
```

---

## GET `/api/interviews/:id`
セッション詳細（メタ・メッセージ・評価）

### Response
```json
{
  "id": "uuid",
  "started_at": "2025-02-16T10:00:00.000Z",
  "ended_at": "2025-02-16T10:15:00.000Z",
  "status": "finished",
  "messages": [
    {
      "role": "user",
      "content": "私の研究は...",
      "correction": null,
      "created_at": "2025-02-16T10:01:00.000Z"
    }
  ],
  "evaluation": {
    "logic": 3,
    "accuracy": 4,
    "clarity": 2,
    "keigo": 3,
    "specificity": 2,
    "strengths": ["..."],
    "weaknesses": ["..."],
    "nextActions": ["..."],
    "summary": "..."
  }
}
```
- `evaluation` は終了済みで評価がある場合のみ存在。未終了の場合は省略。

---

## POST `/api/interviews`
面接セッション開始

### Request
```json
{
  "mode": "standard",
  "profileSnapshot": {
    "researchTheme": "Transformerの効率化",
    "techStack": ["Python", "PyTorch"],
    "targetRole": "ML Engineer"
  }
}
```

### Response
```json
{
  "interviewId": "uuid",
  "firstQuestion": "まず研究テーマを3分で説明してください。"
}
```

---

## POST `/api/chat`
1ターン進行（Structured Outputs必須）

### Request
```json
{
  "interviewId": "uuid",
  "userMessage": "私の研究は..."
}
```

### Response
```json
{
  "message": "ありがとうございます。では...",
  "correction": "（修正例）〜〜です。",
  "is_finished": false,
  "weakness_tags": ["keigo_casual", "ambiguous"]
}
```

---

## POST `/api/interviews/:id/finish`
面接終了＆評価生成。評価の Structured Output パース失敗時は1回リトライし、2回目も失敗時は 500 を返す。詳細は 07_prompt_design 7.5, 7.6。

- **事前条件**: 対象 interview が `status === 'active'` であること。既に終了済み（`finished`）の場合は **409 Conflict** を返す。
- Body なし（パスパラメータ `id` のみ）。

### Response
```json
{
  "evaluation": {
    "logic": 3,
    "accuracy": 4,
    "clarity": 2,
    "keigo": 3,
    "specificity": 2,
    "strengths": ["技術選定の理由が明確"],
    "weaknesses": ["具体例不足"],
    "nextActions": ["STARで1件作る"],
    "summary": "..."
  }
}
```

---

## POST `/api/artifacts/generate`
成果物生成

### Request
```json
{
  "interviewId": "uuid",
  "type": "short_intro_30s"
}
```

### Response
```json
{
  "markdown": "### 30秒自己紹介\n..."
}
```

---

## POST `/api/billing/checkout`
Stripe Checkout URL発行

### Request
```json
{
  "pack": "pack_5"
}
```

### Response
```json
{
  "checkoutUrl": "https://checkout.stripe.com/..."
}
```

---

## POST `/api/billing/webhook`
Stripe webhook受信  
- 署名検証必須  
- `checkout.session.completed` でチケット付与
