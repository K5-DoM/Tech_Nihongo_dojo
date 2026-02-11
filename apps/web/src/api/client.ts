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

export { getToken };
