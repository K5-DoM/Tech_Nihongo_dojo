# 06. API仕様（Hono）

## Base
- `/api/*`

## 認証
- Bearer JWT（Supabase Auth）
- 未認証は 401

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
  "firstQuestion": "まず研究テーマを1分で説明してください。"
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
  "weakness_tags": ["keigo_casual", "too_abstract"]
}
```

---

## POST `/api/interviews/:id/finish`
面接終了＆評価生成

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
