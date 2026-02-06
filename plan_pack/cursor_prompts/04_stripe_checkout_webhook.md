# 04_stripe_checkout_webhook.md
Stripe決済（チケット制）を実装してください。

## 要件
- `/api/billing/checkout` で pack_5 or pack_12 のCheckout URL発行
- `/api/billing/webhook` で署名検証
- checkout.session.completed 時に ticket_count を加算
- billing_events に raw payload を保存
- 冪等性対応（stripe_event_id unique）

## 受け入れ条件
- Stripe CLIでローカル検証可能
- 同一イベント再送でも二重加算されない
