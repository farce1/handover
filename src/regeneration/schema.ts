import { z } from 'zod';

const isoDatetimeSchema = z.string().datetime({ offset: true });

export const regenerationJobStateSchema = z.enum(['queued', 'running', 'completed', 'failed']);

export const regenerationFailureSchema = z
  .object({
    code: z.string().trim().min(1),
    reason: z.string().trim().min(1),
    remediation: z.string().trim().min(1),
  })
  .strict();

export const regenerationTargetRefSchema = z
  .object({
    key: z.string().trim().min(1),
    requested: z.string().trim().min(1),
    canonical: z.string().trim().min(1),
  })
  .strict();

const queuedRegenerationJobSchema = z
  .object({
    id: z.string().trim().min(1),
    state: z.literal('queued'),
    target: regenerationTargetRefSchema,
    createdAt: isoDatetimeSchema,
    updatedAt: isoDatetimeSchema,
    startedAt: z.undefined().optional(),
    terminalAt: z.undefined().optional(),
    failure: z.undefined().optional(),
  })
  .strict();

const runningRegenerationJobSchema = z
  .object({
    id: z.string().trim().min(1),
    state: z.literal('running'),
    target: regenerationTargetRefSchema,
    createdAt: isoDatetimeSchema,
    updatedAt: isoDatetimeSchema,
    startedAt: isoDatetimeSchema,
    terminalAt: z.undefined().optional(),
    failure: z.undefined().optional(),
  })
  .strict();

const completedRegenerationJobSchema = z
  .object({
    id: z.string().trim().min(1),
    state: z.literal('completed'),
    target: regenerationTargetRefSchema,
    createdAt: isoDatetimeSchema,
    updatedAt: isoDatetimeSchema,
    startedAt: isoDatetimeSchema,
    terminalAt: isoDatetimeSchema,
    failure: z.undefined().optional(),
  })
  .strict();

const failedRegenerationJobSchema = z
  .object({
    id: z.string().trim().min(1),
    state: z.literal('failed'),
    target: regenerationTargetRefSchema,
    createdAt: isoDatetimeSchema,
    updatedAt: isoDatetimeSchema,
    startedAt: isoDatetimeSchema,
    terminalAt: isoDatetimeSchema,
    failure: regenerationFailureSchema,
  })
  .strict();

export const regenerationJobSchema = z.discriminatedUnion('state', [
  queuedRegenerationJobSchema,
  runningRegenerationJobSchema,
  completedRegenerationJobSchema,
  failedRegenerationJobSchema,
]);

export const regenerationClientGuidanceSchema = z
  .object({
    nextTool: z.enum(['regenerate_docs', 'regenerate_docs_status']),
    message: z.string().trim().min(1),
    pollAfterMs: z.number().int().positive().optional(),
  })
  .strict();

export const regenerationDedupeMetadataSchema = z
  .object({
    joined: z.boolean(),
    key: z.string().trim().min(1),
    reason: z.enum(['none', 'in_flight_target']),
  })
  .strict();

export const regenerationTriggerSuccessSchema = z
  .object({
    ok: z.literal(true),
    job: regenerationJobSchema,
    dedupe: regenerationDedupeMetadataSchema,
    guidance: regenerationClientGuidanceSchema,
  })
  .strict();

export const regenerationStatusSuccessSchema = z
  .object({
    ok: z.literal(true),
    job: regenerationJobSchema,
    guidance: regenerationClientGuidanceSchema,
  })
  .strict();

export const regenerationErrorResponseSchema = z
  .object({
    ok: z.literal(false),
    error: regenerationFailureSchema,
    validTargets: z.array(z.string().trim().min(1)).optional(),
    guidance: regenerationClientGuidanceSchema,
  })
  .strict();

export const regenerationTriggerResponseSchema = z.discriminatedUnion('ok', [
  regenerationTriggerSuccessSchema,
  regenerationErrorResponseSchema,
]);

export const regenerationStatusResponseSchema = z.discriminatedUnion('ok', [
  regenerationStatusSuccessSchema,
  regenerationErrorResponseSchema,
]);

export type RegenerationClientGuidance = z.infer<typeof regenerationClientGuidanceSchema>;
export type RegenerationDedupeMetadata = z.infer<typeof regenerationDedupeMetadataSchema>;
export type RegenerationFailure = z.infer<typeof regenerationFailureSchema>;
export type RegenerationJob = z.infer<typeof regenerationJobSchema>;
export type RegenerationJobState = z.infer<typeof regenerationJobStateSchema>;
export type RegenerationErrorResponse = z.infer<typeof regenerationErrorResponseSchema>;
export type RegenerationStatusResponse = z.infer<typeof regenerationStatusResponseSchema>;
export type RegenerationTargetRef = z.infer<typeof regenerationTargetRefSchema>;
export type RegenerationTriggerResponse = z.infer<typeof regenerationTriggerResponseSchema>;
