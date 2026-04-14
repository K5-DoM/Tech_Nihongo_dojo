import { describe, it, expect, beforeAll } from "vitest";
import app from "../index";
import { mintTestJwt, testEnv } from "../test-helper";

describe("POST /api/chat", () => {
  let token: string;

  beforeAll(async () => {
    token = await mintTestJwt();
  });

  it("interviewId が UUID でないと 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ interviewId: "not-a-uuid", userMessage: "こんにちは" }),
      }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it("userMessage が空だと 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          interviewId: "00000000-0000-0000-0000-000000000000",
          userMessage: "",
        }),
      }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it("body が JSON でないと 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: "invalid json",
      }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  // 404（存在しない interviewId）は実 Supabase 接続が必要なため結合テストまたは手動で確認
});
