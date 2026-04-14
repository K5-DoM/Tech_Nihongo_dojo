import { describe, it, expect } from "vitest";
import { evaluationSchema } from "./evaluation";

const validEvaluation = {
  logic: 3,
  accuracy: 4,
  clarity: 2,
  keigo: 3,
  specificity: 2,
  strengths: ["技術選定の理由が明確"],
  weaknesses: ["具体例不足"],
  nextActions: ["STARで1件作る"],
  summary: "概ね良好。具体性を増やすとより伝わりやすくなります。",
};

describe("evaluationSchema", () => {
  it("正常: 1〜5のスコアと配列・summary が揃えばパースできる", () => {
    expect(evaluationSchema.parse(validEvaluation)).toEqual(validEvaluation);
  });

  it("正常: スコアが1と5の境界で通る", () => {
    const edge = {
      ...validEvaluation,
      logic: 1,
      accuracy: 5,
    };
    expect(evaluationSchema.parse(edge)).toEqual(edge);
  });

  it("異常: スコアが0だとエラー", () => {
    const bad = { ...validEvaluation, logic: 0 };
    expect(() => evaluationSchema.parse(bad)).toThrow();
  });

  it("異常: スコアが6だとエラー", () => {
    const bad = { ...validEvaluation, clarity: 6 };
    expect(() => evaluationSchema.parse(bad)).toThrow();
  });

  it("異常: summary を省略するとエラー", () => {
    const bad = { ...validEvaluation, summary: undefined } as unknown as Parameters<
      typeof evaluationSchema.parse
    >[0];
    expect(() => evaluationSchema.parse(bad)).toThrow();
  });
});
