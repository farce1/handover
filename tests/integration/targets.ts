/**
 * Validation targets for real-world codebase integration tests.
 *
 * These 5 repositories cover diverse languages and project types:
 * - TypeScript SPA library (Zustand)
 * - Python API template (FastAPI full-stack)
 * - Go microservice example (go-gin-example)
 * - Rust CLI tool (bat)
 * - Mixed large project (Docusaurus)
 *
 * Each target is pinned to a specific ref for reproducible test runs.
 * Timeouts are generous to accommodate full AI pipeline latency.
 */

export interface ValidationTarget {
  name: string;
  category: 'ts-spa' | 'python-api' | 'go-microservice' | 'rust-cli' | 'mixed';
  repo: string;
  ref: string;
  expectedFileCount: { min: number; max: number };
  timeout: number;
}

export const VALIDATION_TARGETS: ValidationTarget[] = [
  {
    name: 'Zustand',
    category: 'ts-spa',
    repo: 'https://github.com/pmndrs/zustand.git',
    ref: 'v5.0.0',
    expectedFileCount: { min: 20, max: 300 },
    timeout: 300_000, // 5 min
  },
  {
    name: 'FastAPI-Template',
    category: 'python-api',
    repo: 'https://github.com/fastapi/full-stack-fastapi-template.git',
    ref: 'master',
    expectedFileCount: { min: 30, max: 400 },
    timeout: 300_000,
  },
  {
    name: 'go-gin-example',
    category: 'go-microservice',
    repo: 'https://github.com/EDDYCJY/go-gin-example.git',
    ref: 'master',
    expectedFileCount: { min: 20, max: 200 },
    timeout: 300_000,
  },
  {
    name: 'bat',
    category: 'rust-cli',
    repo: 'https://github.com/sharkdp/bat.git',
    ref: 'v0.25.0',
    expectedFileCount: { min: 50, max: 400 },
    timeout: 300_000,
  },
  {
    name: 'Docusaurus',
    category: 'mixed',
    repo: 'https://github.com/facebook/docusaurus.git',
    ref: 'v3.6.0',
    expectedFileCount: { min: 100, max: 3000 },
    timeout: 600_000, // 10 min -- large mixed-language project
  },
];
