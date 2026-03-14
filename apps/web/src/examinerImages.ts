/**
 * 表情に応じた試験官画像のマッピング。
 * 画像を有効にするには apps/web/public/examiner/ に以下を配置する:
 *   neutral.svg, listening.svg, thinking.svg, smile.svg
 * （PNG 等でも可。その場合は getExaminerImageSrc のパスを変更すること）
 * 未配置の場合は null のままとし、UI はプレースホルダ（テキスト）で表示する。
 */

export type Expression = "neutral" | "listening" | "thinking" | "smile";

/** 画像を有効にする場合は各キーを "/examiner/neutral.svg" などのパスに変更する。 */
export const EXAMINER_IMAGE_BY_EXPRESSION: Record<Expression, string | null> = {
  neutral: "/examiner/neutral.png",
  listening: "/examiner/listening.png",
  thinking: "/examiner/thinking.png",
  smile: "/examiner/smile.png",
};

export function getExaminerImageSrc(expression: Expression): string | null {
  return EXAMINER_IMAGE_BY_EXPRESSION[expression];
}
