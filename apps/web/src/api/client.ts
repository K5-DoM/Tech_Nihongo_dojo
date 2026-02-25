const getToken = (): string | null =>
  typeof window !== "undefined" ? localStorage.getItem("tech_dojo_jwt") : null;

function headers(): HeadersInit {
  const token = getToken();
  const h: HeadersInit = { "Content-Type": "application/json" };
  if (token) (h as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  return h;
}

export type StartInterviewRes = {
  interviewId: string;
  firstQuestion: string;
};

export async function startInterview(profileSnapshot?: {
  researchTheme?: string;
  techStack?: string[];
  targetRole?: string;
}): Promise<StartInterviewRes> {
  const res = await fetch("/api/interviews", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      mode: "standard",
      profileSnapshot: profileSnapshot ?? {},
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to start interview");
  }
  return res.json();
}

export type ChatRes = {
  message: string;
  correction: string;
  is_finished: boolean;
  weakness_tags: string[];
};

export async function sendChat(interviewId: string, userMessage: string): Promise<ChatRes> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ interviewId, userMessage }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to send message");
  }
  return res.json();
}

export type InterviewListItem = {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  summary: string | null;
};

export type ListInterviewsRes = { interviews: InterviewListItem[] };

export async function listInterviews(params?: { limit?: number; offset?: number }): Promise<ListInterviewsRes> {
  const q = new URLSearchParams();
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  const res = await fetch(`/api/interviews?${q.toString()}`, { method: "GET", headers: headers() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to list interviews");
  }
  return res.json();
}

export type EvaluationRes = {
  logic: number;
  accuracy: number;
  clarity: number;
  keigo: number;
  specificity: number;
  strengths: string[];
  weaknesses: string[];
  nextActions: string[];
  summary: string;
};

export type InterviewDetailRes = {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  messages: Array<{ role: string; content: string; correction?: string; created_at: string }>;
  evaluation?: EvaluationRes;
};

export async function getInterview(id: string): Promise<InterviewDetailRes> {
  const res = await fetch(`/api/interviews/${id}`, { method: "GET", headers: headers() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Interview not found");
  }
  return res.json();
}

export type FinishInterviewRes = { evaluation: EvaluationRes };

export async function finishInterview(id: string): Promise<FinishInterviewRes> {
  const res = await fetch(`/api/interviews/${id}/finish`, { method: "POST", headers: headers() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to finish interview");
  }
  return res.json();
}

export { getToken };
