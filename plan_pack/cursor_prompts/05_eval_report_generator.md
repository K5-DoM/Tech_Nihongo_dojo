# 05_eval_report_generator.md
面接終了時レポート生成を実装してください。

## 要件
- 入力: interviewId
- 会話ログ要約 + 直近弱点タグを文脈に含める
- 5軸評価（1-5）+ strengths/weaknesses/nextActions + summary
- Markdown成果物を3種生成:
  1) 30秒自己紹介
  2) 60秒研究説明
  3) 深掘りQA 10問

## 受け入れ条件
- evaluations保存
- markdownが空文字にならない
