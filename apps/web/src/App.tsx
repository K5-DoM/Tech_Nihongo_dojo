import { useState, useEffect, useCallback } from "react";
import {
  getToken,
  startInterview,
  sendChat,
  listInterviews,
  getInterview,
  finishInterview,
  getProfile,
  updateProfile,
  type Profile,
  type ChatRes,
  type InterviewListItem,
  type InterviewDetailRes,
  type EvaluationRes,
} from "./api/client";
import styles from "./App.module.css";

type View = "list" | "detail" | "chat" | "profile";

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
  const [messages, setMessages] = useState<
    Array<{ role: "user" | "assistant"; text: string; correction?: string; weakness_tags?: string[] }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluationRes | null>(null);
  const [finishLoading, setFinishLoading] = useState(false);

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
                      <div className={styles.listItemSummary}>（評価なし）</div>
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
            {firstQuestion && messages.length === 0 && (
              <div className={styles.bubble + " " + styles.assistant}>
                <p className={styles.label}>面接官</p>
                <p>{firstQuestion}</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={styles.bubble + " " + (m.role === "user" ? styles.user : styles.assistant)}
              >
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
            {evaluation && renderEvaluation(evaluation)}
            {finished && !evaluation && (
              <p className={styles.finished}>面接は終了しました。評価を表示するには「面接を終了して評価を見る」を押してください。</p>
            )}
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
            <div className={styles.navButtons}>
              {!evaluation && (
                <button
                  type="button"
                  onClick={onFinishInterview}
                  disabled={finishLoading || !interviewId}
                >
                  {finishLoading ? "処理中…" : "面接を終了して評価を見る"}
                </button>
              )}
              <button type="button" onClick={openProfile}>
                プロフィール編集
              </button>
              <button type="button" onClick={goToList} className={styles.newSession}>
                面接一覧に戻る
              </button>
            </div>
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
