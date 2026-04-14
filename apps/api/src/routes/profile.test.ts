import { describe, it, expect, beforeAll } from "vitest";
import app from "../index";
import { mintTestJwt, testEnv } from "../test-helper";

describe("GET/PUT /api/profile", () => {
  let token: string;

  beforeAll(async () => {
    token = await mintTestJwt();
  });

  it("PUT: body が JSON でないと 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/profile", {
        method: "PUT",
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

  it("PUT: techStack が配列でないと 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ techStack: "TS" }),
      }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it("PUT: 余計なキーがあると 400（strict）", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ displayName: "a", unknown: "x" }),
      }),
      testEnv
    );
    expect(res.status).toBe(400);
  });
});

