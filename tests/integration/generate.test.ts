/**
 * Real-world codebase validation tests.
 *
 * Clones 5 diverse OSS repositories and runs the FULL `handover generate`
 * pipeline (static analysis + AI rounds + rendering) against each one.
 *
 * Per user decision: "Success = all 14 docs generated without crashes
 * for each target codebase."
 *
 * IMPORTANT: These tests require network access, LLM API credentials,
 * and significant time/cost. They are gated behind two env vars:
 *
 *   HANDOVER_INTEGRATION=1  -- enables the test suite
 *   ANTHROPIC_API_KEY       -- (or other provider key) for the AI pipeline
 *
 * To run:
 *   HANDOVER_INTEGRATION=1 npx vitest run tests/integration/generate.test.ts --timeout 600000
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { VALIDATION_TARGETS, type ValidationTarget } from './targets.js';
import { runCLI } from './setup.js';

const SKIP_REAL_REPOS = !process.env.HANDOVER_INTEGRATION;

/** All 14 expected output documents. */
const EXPECTED_DOCS = [
  '00-INDEX.md',
  '01-PROJECT-OVERVIEW.md',
  '02-GETTING-STARTED.md',
  '03-ARCHITECTURE.md',
  '04-FILE-STRUCTURE.md',
  '05-FEATURES.md',
  '06-MODULES.md',
  '07-DEPENDENCIES.md',
  '08-ENVIRONMENT.md',
  '09-EDGE-CASES.md',
  '10-TECH-DEBT.md',
  '11-CONVENTIONS.md',
  '12-TESTING.md',
  '13-DEPLOYMENT.md',
];

const CLONE_DIR = join(tmpdir(), 'handover-validation-repos');

/**
 * Clone a validation target repository if not already present.
 */
function cloneTarget(target: ValidationTarget): void {
  const dir = join(CLONE_DIR, target.name);
  if (existsSync(dir)) {
    return;
  }

  // SHA refs need full clone + checkout; tags/branches use --depth=1 --branch
  if (/^[a-f0-9]{40}$/.test(target.ref)) {
    execSync(`git clone ${target.repo} "${dir}"`, {
      timeout: 120_000,
      stdio: 'pipe',
    });
    execSync(`git checkout ${target.ref}`, {
      cwd: dir,
      stdio: 'pipe',
    });
  } else {
    execSync(
      `git clone --depth=1 --branch ${target.ref} ${target.repo} "${dir}"`,
      { timeout: 120_000, stdio: 'pipe' },
    );
  }
}

describe.skipIf(SKIP_REAL_REPOS)('real-world codebase validation', () => {
  beforeAll(() => {
    mkdirSync(CLONE_DIR, { recursive: true });

    for (const target of VALIDATION_TARGETS) {
      try {
        cloneTarget(target);
      } catch (error) {
        console.error(
          `Failed to clone ${target.name} (${target.repo}@${target.ref}):`,
          error,
        );
        throw error;
      }
    }
  }, 600_000); // 10 min for all clones

  for (const target of VALIDATION_TARGETS) {
    describe(`${target.name} (${target.category})`, () => {
      const repoDir = join(CLONE_DIR, target.name);
      let result: ReturnType<typeof runCLI>;

      beforeAll(() => {
        // Run FULL pipeline (no --static-only) per user decision:
        // "Success = all 14 docs generated without crashes"
        result = runCLI(repoDir, ['generate'], {
          timeout: target.timeout,
        });
      }, target.timeout + 10_000);

      it('completes without crash', () => {
        expect(result.exitCode).toBe(0);
      });

      it('produces output directory', () => {
        expect(existsSync(join(repoDir, 'handover'))).toBe(true);
      });

      it('generates all 14 documents', () => {
        const outputDir = join(repoDir, 'handover');
        const files = existsSync(outputDir) ? readdirSync(outputDir) : [];
        for (const expectedDoc of EXPECTED_DOCS) {
          expect(files, `Missing document: ${expectedDoc}`).toContain(
            expectedDoc,
          );
        }
      });

      it('all documents have non-trivial content', () => {
        const outputDir = join(repoDir, 'handover');
        for (const doc of EXPECTED_DOCS) {
          const docPath = join(outputDir, doc);
          if (!existsSync(docPath)) {
            // Skip content check if file missing (caught by previous test)
            continue;
          }
          const content = readFileSync(docPath, 'utf-8');
          expect(content.length, `${doc} is too short`).toBeGreaterThan(100);
        }
      });

      it('documents contain valid markdown with YAML front-matter', () => {
        const outputDir = join(repoDir, 'handover');
        for (const doc of EXPECTED_DOCS) {
          const docPath = join(outputDir, doc);
          if (!existsSync(docPath)) {
            continue;
          }
          const content = readFileSync(docPath, 'utf-8');
          expect(content, `${doc} missing front-matter`).toMatch(/^---\n/);
          expect(content, `${doc} missing closing front-matter`).toMatch(
            /\n---\n/,
          );
        }
      });

      it(`completes within ${target.timeout / 1000}s timeout`, () => {
        // If we got here without timeout, the test passed.
        // The timeout is enforced by execFileSync in runCLI.
        expect(result.exitCode).toBe(0);
      });
    });
  }
});
