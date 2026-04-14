import { z } from "zod";

/**
 * POST /api/chat の応答スキーマ（07_prompt_design.md, 06_api_contracts.md）
 * OpenAI Structured Outputs で使用。
 */
export const chatResponseSchema = z.object({
  message: z.string(),
  correction: z.string(),
  is_finished: z.boolean(),
  weakness_tags: z.array(z.string()).max(3),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;
