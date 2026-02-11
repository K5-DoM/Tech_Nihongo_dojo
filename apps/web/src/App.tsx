import { useState } from "react";
import { getToken, startInterview, sendChat, type ChatRes } from "./api/client";
import styles from "./App.module.css";

export default function App() {
  const [token, setToken] = useState(getToken() ?? "");
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [firstQuestion, setFirstQuestion] = useState<string | null>(null);
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string; correction?: string; weakness_tags?: string[] }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const saveToken = () => {
    if (token.trim()) {
      localStorage.setItem("tech_dojo_jwt", token.trim());
      setError(null);
    }
  };

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "面接の開始に失敗しました");
    } finally {
      setLoading(false);
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
      const res: ChatRes = await sendChat(interviewId, msg);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.message,
          correction: res.correction || undefined,
          weakness_tags: res.weakness_tags?.length ? res.weakness_tags : undefined,
        },
      ]);
      if (res.is_finished) setFinished(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setLoading(false);
    }
  };

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

        {!interviewId ? (
          <section>
            <p>面接を開始すると、AI が最初の質問を出します。</p>
            <button onClick={onStart} disabled={loading}>
              {loading ? "開始中…" : "面接を開始"}
            </button>
          </section>
        ) : (
          <section className={styles.chat}>
            {firstQuestion && messages.length === 0 && (
              <div className={styles.bubble + " " + styles.assistant}>
                <p className={styles.label}>面接官</p>
                <p>{firstQuestion}</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={styles.bubble + " " + (m.role === "user" ? styles.user : styles.assistant)}>
                <p className={styles.label}>{m.role === "user" ? "あなた" : "面接官"}</p>
                <p>{m.text}</p>
                {m.correction && (
                  <p className={styles.correction}>修正例: {m.correction}</p>
                )}
                {m.weakness_tags && m.weakness_tags.length > 0 && (
                  <p className={styles.tags}>弱点タグ: {m.weakness_tags.join(", ")}</p>
                )}
              </div>
            ))}
            {finished && <p className={styles.finished}>面接は終了しました。</p>}
            {!finished && (
              <div className={styles.inputRow}>
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onSend()}
                  placeholder="回答を入力..."
                  disabled={loading}
                  className={styles.input}
                />
                <button onClick={onSend} disabled={loading || !userInput.trim()}>
                  {loading ? "送信中…" : "送信"}
                </button>
              </div>
            )}
            <button type="button" onClick={onStart} className={styles.newSession}>
              新しい面接を開始
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
