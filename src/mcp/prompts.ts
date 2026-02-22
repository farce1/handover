import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  answerQuestion,
  formatCitationFootnotes,
  type AnswerQuestionResult,
} from '../qa/answerer.js';
import type { HandoverConfig } from '../config/schema.js';

type WorkflowId = 'architecture' | 'security' | 'dependencies';

interface WorkflowBranch {
  id: string;
  label: string;
  guidance: string;
  followUpPrompt: string;
  nextSteps: string[];
}

interface WorkflowDefinition {
  id: WorkflowId;
  promptName: string;
  title: string;
  description: string;
  promptDescription: string;
  branches: WorkflowBranch[];
}

const workflowArgumentSchema = {
  branch: z.string().trim().min(1).optional(),
  focus: z.string().trim().min(1).optional(),
  question: z.string().trim().min(1).optional(),
} satisfies Record<string, z.ZodType>;

const WORKFLOWS: WorkflowDefinition[] = [
  {
    id: 'architecture',
    promptName: 'workflow_architecture_explainer',
    title: 'Architecture Explainer',
    description:
      'Guided architecture workflow with deterministic branches and a cited completion summary.',
    promptDescription:
      'Use this bounded workflow to explain architecture areas with citations and concrete next steps.',
    branches: [
      {
        id: 'system-overview',
        label: 'System overview',
        guidance: 'Summarize the top-level architecture and how major subsystems interact.',
        followUpPrompt: 'Which subsystem or command should the overview emphasize?',
        nextSteps: [
          'Run `handover search "architecture" --mode=fast` to inspect additional evidence.',
          'Run `handover search "orchestrator" --mode=qa` for deeper synthesized detail.',
        ],
      },
      {
        id: 'execution-flow',
        label: 'Execution flow',
        guidance: 'Trace end-to-end flow from CLI entrypoint to orchestration and outputs.',
        followUpPrompt: 'Which command or execution path should be traced?',
        nextSteps: [
          'Run `handover search "execution flow" --mode=fast` to compare related paths.',
          'Inspect generated docs for command lifecycle and handoff boundaries.',
        ],
      },
      {
        id: 'extension-points',
        label: 'Extension points',
        guidance: 'Highlight where new providers, analyzers, or renderers can be added safely.',
        followUpPrompt: 'Which extension type are you planning to add?',
        nextSteps: [
          'Run `handover search "adding provider" --mode=qa` for implementation guidance.',
          'Review contributor docs before changing extension contracts.',
        ],
      },
    ],
  },
  {
    id: 'security',
    promptName: 'workflow_security_concerns',
    title: 'Security Concerns Review',
    description:
      'Guided security workflow that evaluates likely risk areas using indexed project evidence.',
    promptDescription:
      'Use this bounded workflow to investigate security concerns with citations and remediation steps.',
    branches: [
      {
        id: 'secrets-and-auth',
        label: 'Secrets and authentication',
        guidance:
          'Review API key handling, credential boundaries, and auth-related setup guidance.',
        followUpPrompt: 'Which credential flow or provider setup is the concern?',
        nextSteps: [
          'Run `handover search "API key" --mode=fast` to inspect credential handling docs.',
          'Validate env setup against project security documentation.',
        ],
      },
      {
        id: 'mcp-transport',
        label: 'MCP transport integrity',
        guidance: 'Assess stdout/stderr boundaries and protocol safety in MCP server flows.',
        followUpPrompt: 'Which MCP behavior should be checked for protocol safety?',
        nextSteps: [
          'Run `handover serve` and verify stdout emits only protocol frames.',
          'Run `handover search "stdout stderr MCP" --mode=qa` for rationale and safeguards.',
        ],
      },
      {
        id: 'supply-chain',
        label: 'Dependency and supply-chain posture',
        guidance: 'Review dependency controls, update strategy, and CI security checks.',
        followUpPrompt: 'Which package, workflow, or update surface should be evaluated?',
        nextSteps: [
          'Run `handover search "scorecard codeql" --mode=fast` to locate security pipeline details.',
          'Audit dependency updates with current lockfile and CI checks.',
        ],
      },
    ],
  },
  {
    id: 'dependencies',
    promptName: 'workflow_dependency_understanding',
    title: 'Dependency Understanding',
    description:
      'Guided dependency workflow for tracing package usage, rationale, and integration boundaries.',
    promptDescription:
      'Use this bounded workflow to reason about dependency choices with citations and actionable follow-ups.',
    branches: [
      {
        id: 'why-this-library',
        label: 'Why this library',
        guidance: 'Explain why a dependency was chosen and what alternatives were considered.',
        followUpPrompt: 'Which dependency name should be examined?',
        nextSteps: [
          'Run `handover search "alternatives considered" --mode=qa` for tradeoff context.',
          'Review package.json and roadmap summaries for historical rationale.',
        ],
      },
      {
        id: 'impact-and-risk',
        label: 'Impact and risk',
        guidance: 'Describe operational impact, upgrade risk, and failure modes for a dependency.',
        followUpPrompt: 'Which dependency change or version risk should be analyzed?',
        nextSteps: [
          'Run `handover search "dependency risk" --mode=fast` to inspect relevant references.',
          'Validate lockfile and changelog before upgrading.',
        ],
      },
      {
        id: 'integration-map',
        label: 'Integration map',
        guidance: 'Map where a dependency is used and what modules depend on it.',
        followUpPrompt: 'Which package integration map do you need?',
        nextSteps: [
          'Run `handover search "integration" --mode=fast` to identify usage entry points.',
          'Trace impacted modules before refactoring the dependency.',
        ],
      },
    ],
  },
];

export interface RegisterMcpPromptsOptions {
  config: HandoverConfig;
  answerFn?: typeof answerQuestion;
}

function renderBranchChoices(workflow: WorkflowDefinition): string {
  return workflow.branches
    .map((branch) => `- ${branch.id}: ${branch.label} — ${branch.guidance}`)
    .join('\n');
}

function buildStartMessage(workflow: WorkflowDefinition): string {
  return [
    `${workflow.title} workflow (bounded, 2-step).`,
    '',
    'Step 1: pick one branch:',
    renderBranchChoices(workflow),
    '',
    'Step 2: call this prompt again with a selected `branch` and your specific `question`.',
    'Optional: include `focus` for extra context constraints.',
  ].join('\n');
}

function buildBranchPromptMessage(
  workflow: WorkflowDefinition,
  branch: WorkflowBranch,
  focus?: string,
): string {
  return [
    `${workflow.title} selected branch: ${branch.id} (${branch.label}).`,
    `Guidance: ${branch.guidance}`,
    '',
    `Next required input: ${branch.followUpPrompt}`,
    focus ? `Current focus context: ${focus}` : 'No focus provided yet.',
    '',
    'Call this prompt again with both `branch` and `question` to complete.',
  ].join('\n');
}

function buildWorkflowQuery(branch: WorkflowBranch, question: string, focus?: string): string {
  const normalizedFocus = focus?.trim();
  return [
    `Workflow branch: ${branch.id} (${branch.label})`,
    `Guidance objective: ${branch.guidance}`,
    normalizedFocus ? `Focus constraints: ${normalizedFocus}` : null,
    `User question: ${question}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

function buildCompletionText(
  workflow: WorkflowDefinition,
  branch: WorkflowBranch,
  result: AnswerQuestionResult,
): string {
  const citations =
    result.kind === 'answer'
      ? formatCitationFootnotes(result.answer.citations)
      : formatCitationFootnotes(result.citations);

  const summary =
    result.kind === 'answer'
      ? result.answer.answer
      : `${result.clarification.question}\n\nReason: ${result.clarification.reason}`;

  const nextSteps = branch.nextSteps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  const citationLines = citations.length > 0 ? citations.join('\n') : 'None';

  return [
    `${workflow.title} complete for branch ${branch.id}.`,
    '',
    'Summary:',
    summary,
    '',
    'Citations:',
    citationLines,
    '',
    'Next steps:',
    nextSteps,
  ].join('\n');
}

function getBranch(workflow: WorkflowDefinition, branchId?: string): WorkflowBranch | null {
  if (!branchId) {
    return null;
  }

  return workflow.branches.find((branch) => branch.id === branchId.trim().toLowerCase()) ?? null;
}

export function registerMcpPrompts(server: McpServer, options: RegisterMcpPromptsOptions): void {
  const executeQa = options.answerFn ?? answerQuestion;

  for (const workflow of WORKFLOWS) {
    server.registerPrompt(
      workflow.promptName,
      {
        title: workflow.title,
        description: workflow.promptDescription,
        argsSchema: workflowArgumentSchema,
      },
      async ({ branch: branchInput, focus, question }) => {
        const branch = getBranch(workflow, branchInput);

        if (!branch) {
          return {
            description: workflow.description,
            messages: [
              { role: 'assistant', content: { type: 'text', text: buildStartMessage(workflow) } },
            ],
          };
        }

        if (!question) {
          return {
            description: workflow.description,
            messages: [
              {
                role: 'assistant',
                content: { type: 'text', text: buildBranchPromptMessage(workflow, branch, focus) },
              },
            ],
          };
        }

        const result = await executeQa({
          config: options.config,
          query: buildWorkflowQuery(branch, question, focus),
        });

        return {
          description: workflow.description,
          messages: [
            {
              role: 'assistant',
              content: {
                type: 'text',
                text: buildCompletionText(workflow, branch, result),
              },
            },
          ],
        };
      },
    );
  }
}
