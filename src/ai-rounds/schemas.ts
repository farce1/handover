import { z } from 'zod';

// ─── Round 1: Project Overview (AI-01) ──────────────────────────────────────

export const Round1OutputSchema = z.object({
  projectName: z.string(),
  primaryLanguage: z.string(),
  framework: z.string().optional(),
  purpose: z.string(),
  technicalLandscape: z.string(),
  keyDependencies: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
    }),
  ),
  entryPoints: z.array(
    z.object({
      path: z.string(),
      type: z.string(),
      description: z.string(),
    }),
  ),
  projectScale: z.object({
    fileCount: z.number(),
    estimatedComplexity: z.enum(['small', 'medium', 'large']),
    mainConcerns: z.array(z.string()),
  }),
  techDebt: z.array(z.string()),
  findings: z.array(z.string()),
  openQuestions: z.array(z.string()),
});

export type Round1Output = z.infer<typeof Round1OutputSchema>;

// ─── Round 2: Module Detection (AI-02) ──────────────────────────────────────

export const Round2OutputSchema = z.object({
  modules: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
      purpose: z.string(),
      publicApi: z.array(z.string()),
      files: z.array(z.string()),
      concerns: z.array(z.string()).optional(),
    }),
  ),
  relationships: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      type: z.string(),
      evidence: z.string(),
    }),
  ),
  boundaryIssues: z.array(z.string()),
  findings: z.array(z.string()),
  openQuestions: z.array(z.string()),
});

export type Round2Output = z.infer<typeof Round2OutputSchema>;

// ─── Round 3: Feature Extraction (AI-03) ────────────────────────────────────

export const Round3OutputSchema = z.object({
  features: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      modules: z.array(z.string()),
      entryPoint: z.string(),
      files: z.array(z.string()),
      userFacing: z.boolean(),
    }),
  ),
  crossModuleFlows: z.array(
    z.object({
      name: z.string(),
      path: z.array(z.string()),
      description: z.string(),
    }),
  ),
  findings: z.array(z.string()),
});

export type Round3Output = z.infer<typeof Round3OutputSchema>;

// ─── Round 4: Architecture Detection (AI-04) ────────────────────────────────

export const Round4OutputSchema = z.object({
  patterns: z.array(
    z.object({
      name: z.string(),
      confidence: z.enum(['high']),
      evidence: z.array(z.string()),
      modules: z.array(z.string()),
      description: z.string(),
    }),
  ),
  layering: z
    .object({
      layers: z.array(
        z.object({
          name: z.string(),
          modules: z.array(z.string()),
          responsibility: z.string(),
        }),
      ),
    })
    .optional(),
  dataFlow: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      data: z.string(),
      mechanism: z.string(),
    }),
  ),
  findings: z.array(z.string()),
});

export type Round4Output = z.infer<typeof Round4OutputSchema>;

// ─── Round 5: Edge Cases & Conventions (AI-05) ──────────────────────────────

export const Round5ModuleSchema = z.object({
  moduleName: z.string(),
  edgeCases: z.array(
    z.object({
      description: z.string(),
      file: z.string(),
      line: z.number().optional(),
      severity: z.enum(['critical', 'warning', 'info']),
      evidence: z.string(),
    }),
  ),
  conventions: z.array(
    z.object({
      pattern: z.string(),
      examples: z.array(z.string()),
      description: z.string(),
    }),
  ),
  errorHandling: z.object({
    strategy: z.string(),
    gaps: z.array(z.string()),
    patterns: z.array(z.string()),
  }),
  findings: z.array(z.string()),
});

export type Round5Module = z.infer<typeof Round5ModuleSchema>;

export const Round5OutputSchema = z.object({
  modules: z.array(Round5ModuleSchema),
  crossCuttingConventions: z.array(
    z.object({
      pattern: z.string(),
      description: z.string(),
      frequency: z.string(),
    }),
  ),
  findings: z.array(z.string()),
});

export type Round5Output = z.infer<typeof Round5OutputSchema>;

// ─── Round 6: Deployment Inference (AI-06) ──────────────────────────────────

export const Round6OutputSchema = z.object({
  deployment: z.object({
    platform: z.string().optional(),
    containerized: z.boolean(),
    ciProvider: z.string().optional(),
    evidence: z.array(z.string()),
  }),
  envVars: z.array(
    z.object({
      name: z.string(),
      purpose: z.string(),
      required: z.boolean(),
      source: z.string(),
    }),
  ),
  buildProcess: z.object({
    commands: z.array(z.string()),
    artifacts: z.array(z.string()),
    scripts: z.record(z.string(), z.string()),
  }),
  infrastructure: z.array(
    z.object({
      service: z.string(),
      purpose: z.string(),
      evidence: z.string(),
    }),
  ),
  findings: z.array(z.string()),
});

export type Round6Output = z.infer<typeof Round6OutputSchema>;
