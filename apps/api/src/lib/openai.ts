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

type ProfileSnapshot = Partial<{
  displayName: string;
  major: string;
  researchTheme: string;
  techStack: string[];
  targetRole: string;
  targetCompanyType: string;
  jpLevel: string;
}>;

function renderProfileContext(profile?: ProfileSnapshot): string {
  if (!profile) return "";
  const lines: string[] = [];
  const techStack =
    Array.isArray(profile.techStack) && profile.techStack.length > 0
      ? profile.techStack.join("・")
      : "（未設定）";
  lines.push("候補者プロフィール（面接官が既知。以下は事実として扱い、推測で補完しない）:");
  lines.push(`- 氏名/表示名: ${profile.displayName ?? "（未設定）"}`);
  lines.push(`- 専攻: ${profile.major ?? "（未設定）"}`);
  lines.push(`- 研究テーマ: ${profile.researchTheme ?? "（未設定）"}`);
  lines.push(`- 技術スタック: ${techStack}`);
  lines.push(`- 志望職種: ${profile.targetRole ?? "（未設定）"}`);
  lines.push(`- 志望企業タイプ: ${profile.targetCompanyType ?? "（未設定）"}`);
  lines.push(`- 日本語レベル: ${profile.jpLevel ?? "（未設定）"}`);
  return `\n\n${lines.join("\n")}\n`;
}

/**
 * 面接開始時の初回発言を組み立てる。
 * 「○○さん、本日はよろしくお願いします。では、あなたの研究テーマを～」形式。LLM は使わない。
 */
export function getFirstQuestion(
  _env: OpenAIEnv,
  profile: { displayName?: string }
): string {
  const trimmed = (profile.displayName ?? "").trim();
  const namePart =
    trimmed.length > 0
      ? `${trimmed}さん、本日はよろしくお願いします。`
      : "本日はよろしくお願いします。";
  return `${namePart} では、あなたの研究テーマを3分で説明してください。`;
}

/**
 * 1ターン進行。Structured Output で応答を取得。失敗時は1回リトライし、それでも失敗ならフォールバックを返す。
 * recentWeaknessTags を渡すとシステムプロンプトに注入し、弱点を意識した質問・指摘を促す（07 履歴活用）。
 */
export async function getChatTurn(
  env: OpenAIEnv,
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  userMessage: string,
  options?: {
    recentWeaknessTags?: string[];
    currentFormatGuideline?: string;
    profileContext?: ProfileSnapshot;
  }
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
  const profileContext = renderProfileContext(options?.profileContext);
  const systemContent = CHAT_SYSTEM_PROMPT + profileContext + weaknessHint + formatHint;
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
        model: "gpt-5-mini",
        messages: fullMessages,
        response_format: zodResponseFormat(chatResponseSchema, "chat_response"),
        max_completion_tokens: 2000,
      });
      const msg = completion.choices[0]?.message;
      console.log("[diag] finish_reason:", completion.choices[0]?.finish_reason);
      console.log("[diag] content:", msg?.content);
      console.log("[diag] refusal:", msg?.refusal);
      const raw = msg?.content?.trim();
      if (!raw) return null;
      let jsonParsed: unknown;
      try { jsonParsed = JSON.parse(raw); } catch (pe) { console.log("[diag] JSON.parse error:", pe); return null; }
      const parsed = chatResponseSchema.safeParse(jsonParsed);
      console.log("[diag] schema ok:", parsed.success, parsed.success ? "" : JSON.stringify(parsed.error?.issues));
      return parsed.success ? parsed.data : null;
    } catch (e){
      console.error(e);
      throw e;
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
  console.error()
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
        model: "gpt-5-mini",
        messages: [
          { role: "developer", content: systemContent },
          { role: "user", content: userContent },
        ],
        response_format: zodResponseFormat(evaluationSchema, "evaluation"),
        max_completion_tokens: 2000,
      });
      const raw = completion.choices[0]?.message?.content?.trim();
      if (!raw) return null;
      const parsed = evaluationSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch (err){
      console.error("OpenAI error",err)

      throw err ;
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
