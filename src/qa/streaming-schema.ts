import { z } from 'zod';
import { qaAnswerSchema, qaCitationSchema, qaClarificationSchema } from './schema.js';

const isoDatetimeSchema = z.string().datetime({ offset: true });

const answerQuestionResultSchema = z.discriminatedUnion('kind', [
  z
    .object({
      mode: z.literal('qa'),
      kind: z.literal('answer'),
      query: z.string(),
      answer: qaAnswerSchema,
    })
    .strict(),
  z
    .object({
      mode: z.literal('qa'),
      kind: z.literal('clarification'),
      query: z.string(),
      clarification: qaClarificationSchema,
      citations: z.array(qaCitationSchema),
    })
    .strict(),
]);

const qaReplayCursorSchema = z
  .object({
    lastAckSequence: z.number().int().nonnegative(),
  })
  .strict();

const qaEventProgressDataSchema = z
  .object({
    progress: z.number().min(0).max(1),
    total: z.number().positive().optional(),
    message: z.string().trim().min(1).optional(),
  })
  .strict();

const qaEventStageDataSchema = z
  .object({
    stage: z.string().trim().min(1),
    message: z.string().trim().min(1).optional(),
  })
  .strict();

const qaEventTokenDataSchema = z
  .object({
    token: z.string(),
  })
  .strict();

const qaEventFinalDataSchema = z
  .object({
    result: answerQuestionResultSchema,
  })
  .strict();

const qaEventCancelledDataSchema = z
  .object({
    reason: z.string().trim().min(1).optional(),
  })
  .strict();

const qaEventErrorDataSchema = z
  .object({
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
    recoverable: z.boolean().default(false),
  })
  .strict();

const qaBaseStreamEventSchema = z
  .object({
    sessionId: z.string().trim().min(1),
    sequence: z.number().int().positive(),
    at: isoDatetimeSchema,
  })
  .strict();

export const qaStreamEventSchema = z.discriminatedUnion('kind', [
  qaBaseStreamEventSchema.extend({
    kind: z.literal('progress'),
    data: qaEventProgressDataSchema,
  }),
  qaBaseStreamEventSchema.extend({
    kind: z.literal('stage'),
    data: qaEventStageDataSchema,
  }),
  qaBaseStreamEventSchema.extend({
    kind: z.literal('token'),
    data: qaEventTokenDataSchema,
  }),
  qaBaseStreamEventSchema.extend({
    kind: z.literal('final'),
    data: qaEventFinalDataSchema,
  }),
  qaBaseStreamEventSchema.extend({
    kind: z.literal('cancelled'),
    data: qaEventCancelledDataSchema,
  }),
  qaBaseStreamEventSchema.extend({
    kind: z.literal('error'),
    data: qaEventErrorDataSchema,
  }),
]);

const qaSessionStatusSchema = z.enum(['running', 'completed', 'cancelled', 'failed']);

const qaSessionNonTerminalStateSchema = z
  .object({
    sessionId: z.string().trim().min(1),
    status: z.literal('running'),
    terminalAt: z.undefined().optional(),
    lastSequence: z.number().int().nonnegative(),
    updatedAt: isoDatetimeSchema,
    cursor: qaReplayCursorSchema,
  })
  .strict();

const qaSessionTerminalStateSchema = z
  .object({
    sessionId: z.string().trim().min(1),
    status: z.enum(['completed', 'cancelled', 'failed']),
    terminalAt: isoDatetimeSchema,
    lastSequence: z.number().int().nonnegative(),
    updatedAt: isoDatetimeSchema,
    cursor: qaReplayCursorSchema,
  })
  .strict();

export const qaSessionStateSchema = z.discriminatedUnion('status', [
  qaSessionNonTerminalStateSchema,
  qaSessionTerminalStateSchema,
]);

export { answerQuestionResultSchema, qaReplayCursorSchema, qaSessionStatusSchema };

export type AnswerQuestionResultContract = z.infer<typeof answerQuestionResultSchema>;
export type QaReplayCursor = z.infer<typeof qaReplayCursorSchema>;
export type QaSessionStatus = z.infer<typeof qaSessionStatusSchema>;
export type QaSessionState = z.infer<typeof qaSessionStateSchema>;
export type QaStreamEvent = z.infer<typeof qaStreamEventSchema>;
export type QaStreamEventKind = QaStreamEvent['kind'];
