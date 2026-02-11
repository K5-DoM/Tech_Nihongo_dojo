import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { chatResponseSchema } from "@tech-nihongo-dojo/shared";
import type { ChatResponse } from "@tech-nihongo-dojo/shared";

export type OpenAIEnv = {
  OPENAI_API_KEY: string;
};

const CHAT_SYSTEM_PROMPT = `あなたは日本のIT企業の面接官です。相手はN2〜N1の理系留学生です。
技術的な矛盾・敬語・わかりやすさを評価しつつ、会話の流れを壊さず、必要最小限の修正例を示してください。
返答は必ず指定のJSON形式で出力してください。
弱点タグは最大3つまで。例: keigo_casual, too_abstract, missing_result, logic_jump, overclaim
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
          "あなたは日本のIT企業の面接官です。相手は理系留学生です。以下のプロフィールに基づき、面接の最初の質問を日本語で1文だけ返してください。余計な説明は不要です。",
      },
      {
        role: "user",
        content: `研究テーマ: ${theme}\n技術スタック: ${stack}\n志望職種: ${role}\n\n上記の候補者への最初の質問を1文で。`,
      },
    ],
    max_tokens: 150,
    temperature: 0.4,
  });

  const text = res.choices[0]?.message?.content?.trim();
  return text || "まず研究テーマを1分で説明してください。";
}

/**
 * 1ターン進行。Structured Output で応答を取得。失敗時は1回リトライし、それでも失敗ならフォールバックを返す。
 */
export async function getChatTurn(
  env: OpenAIEnv,
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  userMessage: string
): Promise<ChatResponse> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const fullMessages = [
    { role: "system" as const, content: CHAT_SYSTEM_PROMPT },
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
      const completion = await client.chat.completions.parse({
        model: "gpt-4o-mini",
        messages: fullMessages,
        response_format: zodResponseFormat(chatResponseSchema, "chat_response"),
        max_tokens: 800,
        temperature: 0.3,
      });
      const parsed = completion.choices[0]?.message?.parsed;
      return parsed ?? null;
    } catch {
      return null;
    }
  };

  let result = await run();
  if (result === null) result = await run();
  return result ?? fallback;
}
