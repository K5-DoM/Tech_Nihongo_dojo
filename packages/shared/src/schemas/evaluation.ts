import { z } from "zod";

const score1to5 = z.number().int().min(1).max(5);

/**
 * 5軸評価スキーマ（08_evaluation_rubric.md, 05_db_schema.sql evaluations）
 * POST /api/interviews/:id/finish の応答で使用（Week 3 で実装）。
 */
export const evaluationSchema = z.object({
  logic: score1to5,
  accuracy: score1to5,
  clarity: score1to5,
  keigo: score1to5,
  specificity: score1to5,
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  nextActions: z.array(z.string()),
  summary: z.string(),
});

export type Evaluation = z.infer<typeof evaluationSchema>;
