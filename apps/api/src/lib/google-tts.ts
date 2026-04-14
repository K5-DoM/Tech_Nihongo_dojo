/**
 * Google Cloud Text-to-Speech を REST で呼び出す。
 * Workers では @google-cloud/text-to-speech が使えないため fetch で text:synthesize を呼ぶ。
 * 面接官イメージ: 有能かつ活発な30代女性 → 日本語女性音声（Neural2 優先）。
 */

export type GoogleTTSEnv = {
  GOOGLE_CLOUD_TTS_API_KEY?: string;
};

const SYNTHESIZE_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

/** 日本語女性（Neural2）。利用不可時は Wavenet や ssmlGender にフォールバック可能。 */
const VOICE_NAME = "ja-JP-Neural2-B";

/**
 * テキストを音声化し、base64 エンコードされた MP3 を返す。
 * API キーが未設定または失敗時は null を返す。
 */
export async function synthesizeGoogleTTS(
  env: GoogleTTSEnv,
  text: string
): Promise<{ audioBase64: string; contentType: string } | null> {
  const apiKey = env.GOOGLE_CLOUD_TTS_API_KEY;
  if (!apiKey || !text.trim()) return null;

  const url = `${SYNTHESIZE_URL}?key=${encodeURIComponent(apiKey)}`;
  const body = {
    input: { text: text.trim() },
    voice: {
      languageCode: "ja-JP",
      name: VOICE_NAME,
    },
    audioConfig: {
      audioEncoding: "MP3" as const,
      sampleRateHertz: 24000,
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[google-tts] API error:", res.status, errText);
      return null;
    }
    const data = (await res.json()) as { audioContent?: string };
    const audioBase64 = data.audioContent;
    if (!audioBase64 || typeof audioBase64 !== "string") {
      console.error("[google-tts] No audioContent in response");
      return null;
    }
    return { audioBase64, contentType: "audio/mpeg" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[google-tts] Request failed:", msg);
    return null;
  }
}
