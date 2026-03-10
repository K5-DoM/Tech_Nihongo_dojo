/**
 * 不完全自由形: 面接の質問観点（フォーマット）をコードで定義。
 * 各ターンで「いまの観点」に沿った発言をLLMに生成させる。
 * 理系修士・博士の採用担当が知りたい点（有効性・新規性、苦労、知見）に限定し、
 * ライブラリ名・環境などの些末な深掘りを避ける。
 */

export const QUESTION_FORMAT_GUIDELINES: readonly string[] = [
  "まず研究の背景（なぜその課題に取り組んだか、何が問題か）について、相手の説明を踏まえて質問を1文で。",
  "使用した手法の概要（アイデア、全体の流れ、工夫点）について、相手の説明を踏まえて質問を1文で。",
  "研究の有効性・新規性について、相手の説明を踏まえて深掘りする質問を1文で。",
  "研究で苦労した点や乗り越えた課題について、相手の返答を踏まえて質問を1文で。",
  "研究によって得た知見や今後の展望について、相手の返答を踏まえて質問を1文で。",
  "締めの挨拶と、本日の話への感謝を1文で。必要に応じて is_finished を true に。",
];

/**
 * assistant が既に送ったメッセージ数（0始まり）から、今回使う観点ガイドラインを返す。
 * 観点数を超えた場合は最後の「締め」を使う。
 */
export function getFormatGuidelineForTurn(assistantMessageCount: number): string {
  const index = Math.min(
    assistantMessageCount,
    QUESTION_FORMAT_GUIDELINES.length - 1
  );
  return QUESTION_FORMAT_GUIDELINES[index];
}
