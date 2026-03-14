import { useState, useEffect, useCallback, useRef, KeyboardEvent } from "react";
import {
  getToken,
  startInterview,
  sendChat,
  sendChatWithVoice,
  synthesizeTTS,
  listInterviews,
  getInterview,
  finishInterview,
  getProfile,
  updateProfile,
  transcribeAnswer,
  type Profile,
  type ChatRes,
  type ChatWithVoiceRes,
  type InterviewListItem,
  type InterviewDetailRes,
  type EvaluationRes,
} from "./api/client";
import styles from "./App.module.css";
import { getExaminerImageSrc, type Expression } from "./examinerImages";

/** 利用可能な音声一覧を取得（Chrome は voiceschanged 待ち）。 */
function getVoicesPromise(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const list = window.speechSynthesis.getVoices();
    if (list.length > 0) {
      resolve(list);
      return;
    }
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
  });
}

/** 面接官イメージ: 有能かつ活発な30代女性。日本語音声のうち女性っぽい名前を優先する。 */
function pickExaminerVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const jaVoices = voices.filter((v) => v.lang === "ja-JP" || v.lang.startsWith("ja"));
  if (jaVoices.length === 0) return null;
  const lower = (s: string) => s.toLowerCase();
  const femaleHint = (v: SpeechSynthesisVoice) => {
    const n = lower(v.name);
    return (
      n.includes("female") ||
      n.includes("woman") ||
      n.includes("女性") ||
      n.includes("ayumi") ||
      n.includes("hanako") ||
      n.includes("kyoko")
    );
  };
  return jaVoices.find(femaleHint) ?? jaVoices[0];
}

/** 面接官の返答をブラウザの Speech Synthesis で読み上げる（日本語・女性音声優先）。 */
async function speakWithBrowserTTS(text: string): Promise<void> {
  if (!text.trim() || typeof window === "undefined" || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const voices = await getVoicesPromise();
  const jaVoice = pickExaminerVoice(voices);
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  if (jaVoice) u.voice = jaVoice;
  u.rate = 1;
  u.pitch = 1;
  return new Promise((resolve, reject) => {
    u.onend = () => resolve();
    u.onerror = (e) => reject(e);
    synth.speak(u);
  });
}

/** Web Speech API 互換の型（Chrome / Edge / Safari）。 */
type SpeechRecognitionResultEventLike = {
  resultIndex: number;
  results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } };
};
type SpeechRecognitionLike = {
  stop(): void;
  start(): void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionResultEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type View = "list" | "detail" | "chat" | "profile";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  correction?: string;
  weakness_tags?: string[];
};

type SubtitleKind = "question" | "feedback";

type HistoryTurn = {
  question: string;
  answer?: string;
  hasCorrection?: boolean;
  correctionText?: string;
  weaknessTags?: string[];
};

/** チャット形式の1件（SMS/LINE風の並び用） */
type HistoryMessage =
  | { role: "assistant"; text: string; correction?: string; weakness_tags?: string[] }
  | { role: "user"; text: string };

function turnsToChatMessages(turns: HistoryTurn[]): HistoryMessage[] {
  const list: HistoryMessage[] = [];
  for (const t of turns) {
    list.push({
      role: "assistant",
      text: t.question,
      correction: t.correctionText,
      weakness_tags: t.weaknessTags,
    });
    if (t.answer != null && t.answer.trim() !== "") {
      list.push({ role: "user", text: t.answer });
    }
  }
  return list;
}

type InterviewerViewProps = {
  expression: Expression;
};

function InterviewerView({ expression }: InterviewerViewProps) {
  const label =
    expression === "thinking"
      ? "考え中"
      : expression === "listening"
      ? "傾聴中"
      : expression === "smile"
      ? "良い印象"
      : "待機中";

  const imageSrc = getExaminerImageSrc(expression);

  return (
    <div className={styles.interviewerFrame}>
      <div className={styles.interviewerImage}>
        {imageSrc ? (
          <img src={imageSrc} alt="面接官" />
        ) : (
          <span>面接官</span>
        )}
      </div>
      <div className={styles.expressionBadge}>{label}</div>
    </div>
  );
}

type SubtitleBarProps = {
  text: string | null;
  kind: SubtitleKind;
  loading: boolean;
};

function SubtitleBar({ text, kind, loading }: SubtitleBarProps) {
  if (!text && !loading) return null;

  const label =
    loading ? "面接官が回答を準備しています…" : kind === "question" ? "質問" : "フィードバック";

  const className =
    styles.subtitleBar +
    " " +
    (kind === "question" ? styles.subtitleQuestion : styles.subtitleFeedback);

  return (
    <div className={className}>
      <div className={styles.subtitleLabel}>{label}</div>
      <div className={styles.subtitleText}>
        {text ?? (loading ? "少しお待ちください…" : "")}
      </div>
    </div>
  );
}

type HistoryPanelProps = {
  messages: HistoryMessage[];
};

function HistoryPanel({ messages }: HistoryPanelProps) {
  if (messages.length === 0) {
    return (
      <aside className={styles.historyPanel}>
        <div className={styles.historyTitle}>これまでのやり取り</div>
        <p className={styles.historyEmpty}>まだ履歴はありません。</p>
      </aside>
    );
  }

  return (
    <aside className={styles.historyPanel}>
      <div className={styles.historyTitle}>これまでのやり取り</div>
      <div className={styles.historyList}>
        {messages.map((msg, idx) =>
          msg.role === "assistant" ? (
            <div key={idx} className={styles.historyBubbleWrap}>
              <div className={styles.historyBubbleExaminer}>
                <div className={styles.historyBubbleLabel}>面接官</div>
                <div className={styles.historyBubbleText}>{msg.text}</div>
                {msg.correction && (
                  <div className={styles.historyCorrection}>修正例: {msg.correction}</div>
                )}
                {msg.weakness_tags && msg.weakness_tags.length > 0 && (
                  <div className={styles.historyTag}>弱点: {msg.weakness_tags.join(" / ")}</div>
                )}
              </div>
            </div>
          ) : (
            <div key={idx} className={styles.historyBubbleWrap}>
              <div className={styles.historyBubbleUser}>
                <div className={styles.historyBubbleLabel}>あなた</div>
                <div className={styles.historyBubbleText}>{msg.text}</div>
              </div>
            </div>
          )
        )}
      </div>
    </aside>
  );
}

type AnswerPanelProps = {
  value: string;
  disabled: boolean;
  loading: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  /** 録音ボタン（入力欄右・送信の上）。指定時のみ表示 */
  recordRecording?: boolean;
  recordOnClick?: () => void;
  recordDisabled?: boolean;
};

function AnswerPanel({
  value,
  disabled,
  loading,
  onChange,
  onSend,
  recordRecording,
  recordOnClick,
  recordDisabled,
}: AnswerPanelProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSend();
      }
    }
  };

  const showRecord = recordOnClick != null;

  return (
    <div className={styles.answerPanel}>
      <div className={styles.answerTextareaRow}>
        <textarea
          className={styles.answerTextarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="ここに面接官への回答を入力してください"
          disabled={disabled}
        />
        {showRecord ? (
          <div className={styles.answerButtonColumn}>
            <button
              type="button"
              onClick={recordOnClick}
              disabled={recordDisabled}
            >
              {recordRecording ? "録音停止" : "録音"}
            </button>
            <button type="button" onClick={onSend} disabled={disabled || !value.trim()}>
              {loading ? "送信中…" : "送信"}
            </button>
          </div>
        ) : (
          <button type="button" onClick={onSend} disabled={disabled || !value.trim()}>
            {loading ? "送信中…" : "送信"}
          </button>
        )}
      </div>
      <div className={styles.answerHint}>
        Enter で改行、Ctrl + Enter で送信できます。
      </div>
    </div>
  );
}

/** Chrome / Edge / Safari で利用可能。Firefox は未対応のためサーバー ASR にフォールバック。 */
function isBrowserSpeechRecognitionAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

function useVoiceRecord(disabled: boolean, onTextFromAsr: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const recognitionRef = useRef<{ stop(): void } | null>(null);
  const useBrowserAsr = isBrowserSpeechRecognitionAvailable();

  const startRecordingBrowserAsr = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const SR: (new () => SpeechRecognitionLike) | undefined = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "ja-JP";
    const transcripts: string[] = [];
    recognition.onresult = (e: SpeechRecognitionResultEventLike) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          transcripts.push(e.results[i][0].transcript.trim());
        }
      }
    };
    recognition.onend = () => {
      setRecording(false);
      setRecognizing(false);
      const text = transcripts.join("").trim() || transcripts.join(" ").trim();
      if (text) onTextFromAsr(text);
    };
    recognition.onerror = () => {
      setRecording(false);
      setRecognizing(false);
    };
    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
    setRecognizing(true);
  }, [onTextFromAsr]);

  const stopRecordingBrowserAsr = useCallback(() => {
    const r = recognitionRef.current;
    if (r) {
      r.stop();
      recognitionRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (disabled || recording) return;
    if (useBrowserAsr) {
      try {
        startRecordingBrowserAsr();
      } catch {
        setRecognizing(false);
      }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const localChunks: BlobPart[] = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) localChunks.push(e.data);
      };
      mr.onstop = async () => {
        setRecording(false);
        setMediaRecorder(null);
        stream.getTracks().forEach((t) => t.stop());
        if (localChunks.length === 0) return;
        const blob = new Blob(localChunks, { type: "audio/webm" });
        setRecognizing(true);
        try {
          const { text } = await transcribeAnswer(blob);
          if (text?.trim()) onTextFromAsr(text);
        } finally {
          setRecognizing(false);
        }
      };
      setMediaRecorder(mr);
      mr.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }, [disabled, recording, useBrowserAsr, startRecordingBrowserAsr, onTextFromAsr]);

  const stopRecording = useCallback(() => {
    if (useBrowserAsr) {
      stopRecordingBrowserAsr();
      return;
    }
    if (mediaRecorder && recording) mediaRecorder.stop();
  }, [useBrowserAsr, mediaRecorder, recording, stopRecordingBrowserAsr]);

  const onRecordToggle = useCallback(() => {
    if (recording) stopRecording();
    else startRecording();
  }, [recording, startRecording, stopRecording]);

  const recordDisabled = !recording && (disabled || recognizing);

  return { recording, onRecordToggle, recordDisabled };
}

export default function App() {
  const [token, setToken] = useState(getToken() ?? "");
  const [view, setView] = useState<View>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [list, setList] = useState<InterviewListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [detail, setDetail] = useState<InterviewDetailRes | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [firstQuestion, setFirstQuestion] = useState<string | null>(null);
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluationRes | null>(null);
  const [finishLoading, setFinishLoading] = useState(false);
  const [voiceReplyEnabled] = useState(true);
  /** 面接官の声: ブラウザ（軽い） / OpenAI / Google */
  const [ttsOption, setTtsOption] = useState<"browser" | "openai" | "google">("browser");
  const [lastVoiceAudioUrl, setLastVoiceAudioUrl] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile>({});
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [techStackText, setTechStackText] = useState("");

  const saveToken = () => {
    if (token.trim()) {
      localStorage.setItem("tech_dojo_jwt", token.trim());
      setError(null);
    }
  };

  const loadList = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const { interviews } = await listInterviews();
      setList(interviews);
    } catch (e) {
      setError(e instanceof Error ? e.message : "一覧の取得に失敗しました");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "list" && token.trim()) loadList();
  }, [view, token, loadList]);

  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const data = await getInterview(id);
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "詳細の取得に失敗しました");
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (view === "detail" && selectedId) loadDetail(selectedId);
  }, [view, selectedId]);

  const onTextFromAsr = useCallback((text: string) => {
    setUserInput((prev) => (prev?.trim() ? `${prev.trim()}\n${text}` : text));
  }, []);
  const voiceRecord = useVoiceRecord(
    view !== "chat" || !interviewId || loading || finished,
    onTextFromAsr
  );

  const onStart = async () => {
    if (!token.trim()) {
      setError("JWT を入力して保存してください");
      return;
    }
    saveToken();
    setError(null);
    setLoading(true);
    try {
      const { interviewId: id, firstQuestion: q } = await startInterview();
      setInterviewId(id);
      setFirstQuestion(q);
      setMessages([]);
      setFinished(false);
      setEvaluation(null);
      setSelectedId(id);
      setView("chat");
      // 初回質問をTTSで再生（OpenAI/Google 選択時のみ。ブラウザTTSは再生しない）
      if (voiceReplyEnabled && q && (ttsOption === "openai" || ttsOption === "google")) {
        (async () => {
          try {
            const r = await synthesizeTTS(q, {
              ttsProvider: ttsOption === "google" ? "google" : "openai",
            });
            if (!r.audioBase64) return;
            const binary = atob(r.audioBase64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const contentType = r.audioContentType ?? "audio/mpeg";
            const blob = new Blob([bytes], { type: contentType });
            const url = URL.createObjectURL(blob);
            setLastVoiceAudioUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return url;
            });
            const audio = new Audio(url);
            await audio.play().catch((e) => console.warn("First-question TTS play failed:", e));
          } catch (e) {
            console.warn("First-question TTS failed:", e);
          }
        })();
      } else if (voiceReplyEnabled && q && ttsOption === "browser") {
        (async () => {
          try {
            await speakWithBrowserTTS(q);
          } catch (e) {
            console.warn("First-question browser TTS failed:", e);
          }
        })();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "面接の開始に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const openProfile = async () => {
    if (!token.trim()) {
      setError("JWT を入力して保存してください");
      return;
    }
    saveToken();
    setView("profile");
    setProfileLoading(true);
    setError(null);
    try {
      const { profile } = await getProfile();
      setProfile(profile);
      setTechStackText((profile.techStack ?? []).join(", "));
    } catch (e) {
      setError(e instanceof Error ? e.message : "プロフィールの取得に失敗しました");
      setProfile({});
      setTechStackText("");
    } finally {
      setProfileLoading(false);
    }
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    setError(null);
    const techStack = techStackText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    try {
      const normalize = (v: unknown): string | undefined => {
        if (typeof v !== "string") return undefined;
        const t = v.trim();
        return t.length > 0 ? t : undefined;
      };
      const { profile: saved } = await updateProfile({
        displayName: normalize(profile.displayName),
        major: normalize(profile.major),
        researchTheme: normalize(profile.researchTheme),
        techStack: techStack.length > 0 ? techStack : undefined,
        targetRole: normalize(profile.targetRole),
        targetCompanyType: normalize(profile.targetCompanyType),
        jpLevel: normalize(profile.jpLevel),
      });
      setProfile(saved);
      setTechStackText((saved.techStack ?? []).join(", "));
    } catch (e) {
      setError(e instanceof Error ? e.message : "プロフィールの保存に失敗しました");
    } finally {
      setProfileSaving(false);
    }
  };

  const onSend = async () => {
    if (!interviewId || !userInput.trim()) return;
    const msg = userInput.trim();
    setUserInput("");
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setLoading(true);
    setError(null);
    try {
      let res: ChatRes | ChatWithVoiceRes;
      if (voiceReplyEnabled && (ttsOption === "openai" || ttsOption === "google")) {
        res = await sendChatWithVoice(interviewId, msg, {
          ttsProvider: ttsOption === "google" ? "google" : "openai",
        });
      } else {
        res = await sendChat(interviewId, msg);
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.message,
          correction: res.correction || undefined,
          weakness_tags: res.weakness_tags?.length ? res.weakness_tags : undefined,
        },
      ]);

      if (voiceReplyEnabled && res.message) {
        if (
          (ttsOption === "openai" || ttsOption === "google") &&
          "audioBase64" in res &&
          res.audioBase64
        ) {
          const binary = atob(res.audioBase64);
          const len = binary.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
          const contentType =
            "audioContentType" in res && res.audioContentType
              ? (res.audioContentType as string)
              : "audio/mpeg";
          const blob = new Blob([bytes], { type: contentType });
          const url = URL.createObjectURL(blob);
          if (lastVoiceAudioUrl) URL.revokeObjectURL(lastVoiceAudioUrl);
          setLastVoiceAudioUrl(url);
          const audio = new Audio(url);
          await audio.play().catch((e) => console.warn("TTS play failed:", e));
        } else {
          try {
            await speakWithBrowserTTS(res.message);
          } catch (e) {
            console.warn("Browser TTS failed:", e);
          }
        }
      }

      if (res.is_finished) setFinished(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const onFinishInterview = async () => {
    if (!interviewId) return;
    setFinishLoading(true);
    setError(null);
    try {
      const { evaluation: ev } = await finishInterview(interviewId);
      setEvaluation(ev);
      setFinished(true);
      loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "終了処理に失敗しました");
    } finally {
      setFinishLoading(false);
    }
  };

  const openDetail = (id: string) => {
    setSelectedId(id);
    setView("detail");
    setDetail(null);
  };

  const openChatFromDetail = () => {
    if (!detail) return;
    setInterviewId(detail.id);
    const msgs = detail.messages;
    const firstAsst = msgs.find((m) => m.role === "assistant");
    setFirstQuestion(firstAsst?.content ?? null);
    setMessages(
      msgs.map((m) => ({
        role: m.role as "user" | "assistant",
        text: m.content,
        correction: m.correction,
      }))
    );
    setFinished(detail.status === "finished");
    setEvaluation(detail.evaluation ?? null);
    setView("chat");
  };

  const goToList = () => {
    setView("list");
    setSelectedId(null);
    setDetail(null);
    setInterviewId(null);
    setFirstQuestion(null);
    setMessages([]);
    setEvaluation(null);
    setError(null);
    loadList();
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  const renderEvaluation = (ev: EvaluationRes) => (
    <div className={styles.evaluationBox}>
      <h3>5軸評価</h3>
      <div className={styles.evaluationScores}>
        <span>論理性: {ev.logic}</span>
        <span>正確さ: {ev.accuracy}</span>
        <span>わかりやすさ: {ev.clarity}</span>
        <span>敬語: {ev.keigo}</span>
        <span>明確さ: {ev.specificity}</span>
      </div>
      {ev.strengths.length > 0 && <p><strong>良かった点:</strong> {ev.strengths.join(" / ")}</p>}
      {ev.weaknesses.length > 0 && <p><strong>改善点:</strong> {ev.weaknesses.join(" / ")}</p>}
      {ev.nextActions.length > 0 && <p><strong>次のアクション:</strong> {ev.nextActions.join(" / ")}</p>}
      <p className={styles.evaluationSummary}>{ev.summary}</p>
    </div>
  );

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1>Tech Nihongo Dojo</h1>
        <div className={styles.tokenRow}>
          <label>
            JWT（開発用）:
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onBlur={saveToken}
              placeholder="Bearer トークン"
              className={styles.tokenInput}
            />
          </label>
          <button type="button" onClick={saveToken}>
            保存
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {error && <div className={styles.error}>{error}</div>}

        {view === "list" && (
          <section>
            <p>セッション一覧。行をクリックで詳細、または新しい面接を開始できます。</p>
            <div className={styles.navButtons}>
              <button onClick={onStart} disabled={loading || listLoading}>
                {loading ? "開始中…" : "面接を開始"}
              </button>
              <button type="button" onClick={openProfile} disabled={loading || listLoading}>
                プロフィール編集
              </button>
            </div>
            {listLoading ? (
              <p>読み込み中…</p>
            ) : (
              <div className={styles.list}>
                {list.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.listItem}
                    onClick={() => openDetail(item.id)}
                  >
                    <div className={styles.listItemMeta}>
                      {formatDate(item.started_at)} — {item.status}
                    </div>
                    {item.summary ? (
                      <div className={styles.listItemSummary}>{item.summary}</div>
                    ) : (
                      <div className={styles.listItemSummary}>
                        {item.status === "finished"
                          ? "評価済み（クリックで表示）"
                          : "（評価なし）"}
                      </div>
                    )}
                  </button>
                ))}
                {list.length === 0 && !listLoading && <p>セッションがありません。</p>}
              </div>
            )}
          </section>
        )}

        {view === "detail" && (
          <section className={styles.detail}>
            <div className={styles.navButtons}>
              <button type="button" onClick={goToList}>
                一覧に戻る
              </button>
              <button type="button" onClick={openProfile}>
                プロフィール編集
              </button>
            </div>
            {detailLoading ? (
              <p>読み込み中…</p>
            ) : detail ? (
              <>
                <p className={styles.listItemMeta}>
                  {formatDate(detail.started_at)} — {detail.status}
                </p>
                <div className={styles.detailMessages}>
                  {detail.messages.map((m, i) => (
                    <div
                      key={i}
                      className={styles.bubble + " " + (m.role === "user" ? styles.user : styles.assistant)}
                    >
                      <p className={styles.label}>{m.role === "user" ? "あなた" : "面接官"}</p>
                      <p>{m.content}</p>
                      {m.correction && (
                        <p className={styles.correction}>修正例: {m.correction}</p>
                      )}
                    </div>
                  ))}
                </div>
                {detail.evaluation && renderEvaluation(detail.evaluation)}
                <div className={styles.navButtons}>
                  {detail.status === "active" && (
                    <button type="button" onClick={openChatFromDetail}>
                      続きをする
                    </button>
                  )}
                  <button type="button" onClick={goToList}>
                    一覧に戻る
                  </button>
                </div>
              </>
            ) : null}
          </section>
        )}

        {view === "chat" && (
          <section className={styles.chat}>
            {(() => {
              const assistantMessages = [
                ...(firstQuestion ? [{ text: firstQuestion }] : []),
                ...messages.filter((m) => m.role === "assistant").map((m) => ({ text: m.text })),
              ];
              const assistantDetails = messages.filter((m) => m.role === "assistant");
              const userMessages = messages.filter((m) => m.role === "user");
              const turns: HistoryTurn[] = assistantMessages.map((a, idx) => {
                const question = a.text;
                const user = userMessages[idx];
                const detailIndex = firstQuestion ? idx - 1 : idx;
                const detail = detailIndex >= 0 ? assistantDetails[detailIndex] : undefined;
                return {
                  question,
                  answer: user?.text,
                  hasCorrection: !!detail?.correction,
                  correctionText: detail?.correction,
                  weaknessTags: detail?.weakness_tags,
                };
              });

              const latestAssistantIndex = assistantMessages.length - 1;
              const currentSubtitleText =
                latestAssistantIndex >= 0 ? assistantMessages[latestAssistantIndex].text : null;
              const subtitleKind: SubtitleKind =
                latestAssistantIndex <= 0 ? "question" : "feedback";
              /* チャット形式（SMS/LINE風）で左パネルに表示 */
              const historyMessages = turnsToChatMessages(turns);

              const expression: Expression =
                loading && !finished
                  ? "thinking"
                  : finished
                  ? "smile"
                  : userInput.trim().length > 0
                  ? "listening"
                  : "neutral";

              const statusText = finished
                ? "このセッションは終了しました。評価を確認して次の面接に備えましょう。"
                : loading
                ? "面接官があなたの回答をもとに、次のメッセージを準備しています…"
                : userInput.trim().length > 0
                ? "Enter で改行、Ctrl + Enter で送信できます。"
                : "面接官の質問に対する回答を考えて入力してみましょう。";

              return (
                <div className={styles.chatLayout}>
                  <div className={styles.chatMain}>
                    <div className={styles.chatTop}>
                      <InterviewerView expression={expression} />
                      <SubtitleBar
                        text={currentSubtitleText}
                        kind={subtitleKind}
                        loading={loading}
                      />
                    </div>
                    <div className={styles.chatScroll}>
                      <p className={styles.chatStatus}>{statusText}</p>
                      {evaluation && renderEvaluation(evaluation)}
                      {finished && !evaluation && (
                        <p className={styles.finished}>
                          終了しました。「面接終了」を押して評価を表示。
                        </p>
                      )}
                      {voiceReplyEnabled && (
                        <div className={styles.ttsSwitch}>
                          <span className={styles.ttsSwitchLabel}>面接官の声:</span>
                          <label className={styles.ttsSwitchOption}>
                            <input
                              type="radio"
                              name="tts"
                              checked={ttsOption === "browser"}
                              onChange={() => setTtsOption("browser")}
                            />
                            ブラウザ（軽い）
                          </label>
                          <label className={styles.ttsSwitchOption}>
                            <input
                              type="radio"
                              name="tts"
                              checked={ttsOption === "openai"}
                              onChange={() => setTtsOption("openai")}
                            />
                            OpenAI（高音質）
                          </label>
                          <label className={styles.ttsSwitchOption}>
                            <input
                              type="radio"
                              name="tts"
                              checked={ttsOption === "google"}
                              onChange={() => setTtsOption("google")}
                            />
                            Google（高音質）
                          </label>
                        </div>
                      )}
                    </div>
                    <div className={styles.chatInputBar}>
                      <AnswerPanel
                        value={userInput}
                        onChange={setUserInput}
                        onSend={onSend}
                        disabled={loading || finished || !interviewId}
                        loading={loading}
                        recordRecording={view === "chat" ? voiceRecord.recording : undefined}
                        recordOnClick={view === "chat" ? voiceRecord.onRecordToggle : undefined}
                        recordDisabled={view === "chat" ? voiceRecord.recordDisabled : undefined}
                      />
                      <div className={styles.navButtons}>
                        {!evaluation && (
                          <button
                            type="button"
                            onClick={onFinishInterview}
                            disabled={finishLoading || !interviewId}
                          >
                            {finishLoading ? "処理中…" : "面接終了"}
                          </button>
                        )}
                        <button type="button" onClick={openProfile}>
                          プロフィール編集
                        </button>
                        <button
                          type="button"
                          onClick={goToList}
                          className={styles.newSession}
                        >
                          面接一覧に戻る
                        </button>
                      </div>
                    </div>
                  </div>
                  <HistoryPanel messages={historyMessages} />
                </div>
              );
            })()}
          </section>
        )}

        {view === "profile" && (
          <section className={styles.detail}>
            <div className={styles.navButtons}>
              <button type="button" onClick={goToList}>
                一覧に戻る
              </button>
            </div>

            <h2>プロフィール</h2>
            {profileLoading ? (
              <p>読み込み中…</p>
            ) : (
              <>
                <label>
                  表示名:
                  <input
                    type="text"
                    value={profile.displayName ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, displayName: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label>
                  専攻:
                  <input
                    type="text"
                    value={profile.major ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, major: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label>
                  研究テーマ:
                  <input
                    type="text"
                    value={profile.researchTheme ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, researchTheme: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label>
                  技術スタック（カンマ区切り）:
                  <input
                    type="text"
                    value={techStackText}
                    onChange={(e) => setTechStackText(e.target.value)}
                    className={styles.input}
                  />
                </label>
                <label>
                  志望職種:
                  <input
                    type="text"
                    value={profile.targetRole ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, targetRole: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label>
                  志望企業タイプ:
                  <input
                    type="text"
                    value={profile.targetCompanyType ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, targetCompanyType: e.target.value }))}
                    className={styles.input}
                  />
                </label>
                <label>
                  日本語レベル:
                  <input
                    type="text"
                    value={profile.jpLevel ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, jpLevel: e.target.value }))}
                    className={styles.input}
                  />
                </label>

                <div className={styles.navButtons}>
                  <button type="button" onClick={saveProfile} disabled={profileSaving}>
                    {profileSaving ? "保存中…" : "保存"}
                  </button>
                  <button type="button" onClick={openProfile} disabled={profileSaving}>
                    再読み込み
                  </button>
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
