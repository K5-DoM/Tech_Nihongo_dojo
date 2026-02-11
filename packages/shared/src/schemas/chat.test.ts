import { describe, it, expect } from "vitest";
import { chatResponseSchema } from "./chat";

describe("chatResponseSchema", () => {
  it("正常: 必須項目が揃えばパースできる", () => {
    const ok = {
      message: "次の質問です。",
      correction: "",
      is_finished: false,
      weakness_tags: ["keigo_casual"],
    };
    expect(chatResponseSchema.parse(ok)).toEqual(ok);
  });

  it("正常: weakness_tags が3件まで通る", () => {
    const ok = {
      message: "a",
      correction: "b",
      is_finished: true,
      weakness_tags: ["a", "b", "c"],
    };
    expect(chatResponseSchema.parse(ok)).toEqual(ok);
  });

  it("異常: weakness_tags が4件は通らない", () => {
    const bad = {
      message: "a",
      correction: "",
      is_finished: false,
      weakness_tags: ["a", "b", "c", "d"],
    };
    expect(() => chatResponseSchema.parse(bad)).toThrow();
  });

  it("異常: message を省略するとエラー", () => {
    const bad = {
      correction: "",
      is_finished: false,
      weakness_tags: [],
    };
    expect(() => chatResponseSchema.parse(bad)).toThrow();
  });

  it("異常: is_finished に文字列を渡すとエラー", () => {
    const bad = {
      message: "a",
      correction: "",
      is_finished: "false",
      weakness_tags: [],
    };
    expect(() => chatResponseSchema.parse(bad)).toThrow();
  });
});
