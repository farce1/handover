import { z } from 'zod';

export const qaCitationSchema = z.object({
  sourceFile: z.string().min(1),
  sectionPath: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
});

export const qaClarificationSchema = z.object({
  question: z.string().min(1),
  reason: z.string().min(1),
});

export const qaAnswerSchema = z.object({
  answer: z.string().min(1),
  citations: z.array(qaCitationSchema).min(1),
});

export const qaSynthesisSchema = z.object({
  answer: z.string().min(1),
});

export type QaCitation = z.infer<typeof qaCitationSchema>;
export type QaClarification = z.infer<typeof qaClarificationSchema>;
export type QaAnswer = z.infer<typeof qaAnswerSchema>;
