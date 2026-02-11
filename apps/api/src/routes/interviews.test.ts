import { describe, it, expect, beforeAll } from "vitest";
import app from "../index";
import { mintTestJwt, testEnv } from "../test-helper";

describe("POST /api/interviews", () => {
  let token: string;

  beforeAll(async () => {
    token = await mintTestJwt();
  });

  it("profileSnapshot の型が不正だと 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/interviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: "standard",
          profileSnapshot: { researchTheme: 123 },
        }),
      }),
      testEnv
    );
    expect(res.status).toBe(400);
  });
});
