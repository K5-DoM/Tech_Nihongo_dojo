import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { chatResponseSchema, evaluationSchema } from "@tech-nihongo-dojo/shared";
import type { ChatResponse, Evaluation } from "@tech-nihongo-dojo/shared";

/** LLM 呼び出しのイベントログ（運用・デバッグ用）。必要に応じて外部ロガーに差し替え可能。 */
function logDojoLlm(payload: { event: string; attempt?: number }): void {
  if (typeof console !== "undefined" && console.debug) {
    console.debug("[dojo-llm]", payload.event, payload.attempt != null ? { attempt: payload.attempt } : "");
  }
}

export type OpenAIEnv = {
  OPENAI_API_KEY: string;
};

const CHAT_SYSTEM_PROMPT = `あなたは日本のIT企業の理系採用面接官です。相手は日本語能力がN2〜N1である理系留学生です。
有効性・新規性、研究で苦労した点、研究によって得た知見など、採用担当が知りたい本質的な点を聞いてください。ライブラリ名・環境・細かい既存技術の解説要求は避けてください。
技術的な矛盾・敬語・わかりやすさを評価しつつ、会話の流れを壊さず、必要最小限の修正例を示してください。
返答は必ず指定のJSON形式で出力してください。
弱点タグは最大3つまで。例: keigo_casual, ambiguous, missing_result, logic_jump, overclaim
面接を終了する場合は is_finished を true にし、message に締めの言葉を入れてください。`;

/**
 * 面接開始時の初回質問を1つ生成する。
 */
export async function getFirstQuestion(
  env: OpenAIEnv,
  profile: { researchTheme?: string; techStack?: string[]; targetRole?: string }
): Promise<string> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const theme = profile.researchTheme ?? "（未設定）";
  const stack = profile.techStack?.length ? profile.techStack.join("・") : "（未設定）";
  const role = profile.targetRole ?? "（未設定）";

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "あなたは日本のIT企業の理系採用面接官です。相手は理系留学生です。研究テーマの概要を3分で説明してもらうための、最初の質問を日本語で1文だけ返してください。余計な説明は不要です。",
      },
      {
        role: "user",
        content: `研究テーマ: ${theme}\n技術スタック: ${stack}\n志望職種: ${role}\n\n上記の候補者へ、研究概要を3分で説明してもらうための最初の質問を1文で。`,
      },
    ],
    max_tokens: 150,
    temperature: 0.4,
  });

  const text = res.choices[0]?.message?.content?.trim();
  return text || "まず研究テーマを3分で説明してください。";
}

/**
 * 1ターン進行。Structured Output で応答を取得。失敗時は1回リトライし、それでも失敗ならフォールバックを返す。
 * recentWeaknessTags を渡すとシステムプロンプトに注入し、弱点を意識した質問・指摘を促す（07 履歴活用）。
 */
export async function getChatTurn(
  env: OpenAIEnv,
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  userMessage: string,
  options?: { recentWeaknessTags?: string[]; currentFormatGuideline?: string }
): Promise<ChatResponse> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const recentTags = options?.recentWeaknessTags ?? [];
  const weaknessHint =
    recentTags.length > 0
      ? `\nこの候補者の直近の弱点タグ: ${recentTags.join(", ")} を意識して質問・指摘してください。`
      : "";
  const formatHint =
    options?.currentFormatGuideline != null && options.currentFormatGuideline !== ""
      ? `\n今回の観点: ${options.currentFormatGuideline}\n相手の直近の返答を踏まえ、この観点に沿った質問またはコメントを1文で生成してください。ライブラリ名・環境・細かい既存技術の説明要求は避け、背景・有効性・新規性・苦労・使用手法の概要・知見など、採用担当が知りたい点に焦点を当ててください。`
      : "";
  const systemContent = CHAT_SYSTEM_PROMPT + weaknessHint + formatHint;
  const fullMessages = [
    { role: "system" as const, content: systemContent },
    ...messages,
    { role: "user" as const, content: userMessage },
  ];

  const fallback: ChatResponse = {
    message: "申し訳ございません。処理中に問題が発生しました。もう一度送信してください。",
    correction: "",
    is_finished: false,
    weakness_tags: [],
  };

  const run = async (): Promise<ChatResponse | null> => {
    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: fullMessages,
        response_format: zodResponseFormat(chatResponseSchema, "chat_response"),
        max_tokens: 800,
        temperature: 0.3,
      });
      const raw = completion.choices[0]?.message?.content?.trim();
      if (!raw) return null;
      const parsed = chatResponseSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  let result = await run();
  if (result !== null) {
    logDojoLlm({ event: "chat_parse_ok", attempt: 1 });
    return result;
  }
  logDojoLlm({ event: "chat_parse_retry", attempt: 1 });
  result = await run();
  if (result !== null) {
    logDojoLlm({ event: "chat_parse_ok", attempt: 2 });
    return result;
  }
  logDojoLlm({ event: "chat_fallback" });
  return fallback;
}

/**
 * 面接終了時の5軸評価を1回のLLMコールで生成（07_prompt_design 7.5）。
 * 会話ログ・直近弱点タグを入力とし、evaluationSchema で Structured Output。
 * パース失敗時は1回リトライ。
 */
export async function getEvaluation(
  env: OpenAIEnv,
  conversationLog: string,
  recentWeaknessTags: string[],
  targetRole?: string
): Promise<Evaluation | null> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const role = targetRole ?? "（未設定）";
  const weaknessLine =
    recentWeaknessTags.length > 0
      ? `直近の弱点タグ: ${recentWeaknessTags.join(", ")}`
      : "直近の弱点タグはありません。";

  const systemContent = `あなたは日本のIT企業の面接官です。理系留学生の模擬面接の会話ログを読み、5軸で評価してください。
評価軸: 論理性(1-5)、技術的正確さ(1-5)、わかりやすさ(1-5)、敬語・ビジネス日本語(1-5)、明確さ＝曖昧・理解困難でないこと(1-5)。
strengths/weaknesses/nextActions はそれぞれ配列で、nextActions は行動ベースで最大3つ。summary は120字程度の日本語で。
必ず指定のJSON形式のみで出力してください。`;

  const userContent = `志望職種: ${role}\n${weaknessLine}\n\n--- 会話ログ ---\n${conversationLog}\n---\n\n上記会話を評価し、指定JSON形式で出力してください。`;

  const run = async (): Promise<Evaluation | null> => {
    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userContent },
        ],
        response_format: zodResponseFormat(evaluationSchema, "evaluation"),
        max_tokens: 600,
        temperature: 0.3,
      });
      const raw = completion.choices[0]?.message?.content?.trim();
      if (!raw) return null;
      const parsed = evaluationSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  let result = await run();
  if (result !== null) {
    logDojoLlm({ event: "evaluation_parse_ok", attempt: 1 });
    return result;
  }
  logDojoLlm({ event: "evaluation_parse_retry", attempt: 1 });
  result = await run();
  if (result !== null) {
    logDojoLlm({ event: "evaluation_parse_ok", attempt: 2 });
    return result;
  }
  logDojoLlm({ event: "evaluation_parse_fail" });
  return result;
}
