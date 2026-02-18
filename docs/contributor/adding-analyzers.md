# Adding an analyzer

handover runs eight static analyzers concurrently — each examines a different dimension of the codebase (file structure, dependencies, git history, TODOs, environment variables, AST, tests, and documentation). All eight run in parallel via `Promise.allSettled()` in `src/analyzers/coordinator.ts`. Adding a new analyzer means writing the analyzer function, registering it in the coordinator, optionally defining a new output type, and optionally wiring it to a renderer.

## Step 1: Create the analyzer file

Create a new file in `src/analyzers/`. Follow the naming convention of existing analyzers (e.g., `src/analyzers/license-scanner.ts`).

Every analyzer is an async function with this signature:

```typescript
export async function analyzeX(ctx: AnalysisContext): Promise<AnalyzerResult<YourResult>>;
```

Where:

- `AnalysisContext` (from `src/analyzers/types.ts`) provides `rootDir`, `files` (a list of `FileEntry` objects with `path`, `absolutePath`, `size`, and `extension`), `config` (the full `HandoverConfig`), a file-hash `cache`, and `gitDepth`
- `AnalyzerResult<T>` (from `src/analyzers/types.ts`) is `{ success: boolean; data?: T; error?: string; elapsed: number }`

Here is a skeleton:

```typescript
// src/analyzers/license-scanner.ts
import { readFile } from 'node:fs/promises';
import type { AnalysisContext, AnalyzerResult } from './types.js';

export interface LicenseResult {
  licenseFile: string | null;
  licenseType: string | null;
  summary: {
    hasLicense: boolean;
    licenseType: string | null;
  };
}

export async function analyzeLicense(ctx: AnalysisContext): Promise<AnalyzerResult<LicenseResult>> {
  const start = performance.now();

  try {
    // Use ctx.files to find files matching your criteria.
    // ctx.files is already filtered by .gitignore and handover's include/exclude config.
    const licenseFile = ctx.files.find((f) =>
      /^license(\.(md|txt))?$/i.test(f.path.split('/').at(-1) ?? ''),
    );

    let licenseType: string | null = null;
    if (licenseFile) {
      const content = await readFile(licenseFile.absolutePath, 'utf-8');
      if (/MIT License/i.test(content)) licenseType = 'MIT';
      else if (/Apache License/i.test(content)) licenseType = 'Apache-2.0';
      else if (/GNU General Public/i.test(content)) licenseType = 'GPL';
    }

    return {
      success: true,
      data: {
        licenseFile: licenseFile?.path ?? null,
        licenseType,
        summary: {
          hasLicense: !!licenseFile,
          licenseType,
        },
      },
      elapsed: performance.now() - start,
    };
  } catch (error) {
    // Always return a result — the coordinator uses the empty fallback on failure
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      elapsed: performance.now() - start,
    };
  }
}
```

Important: always wrap the body in a `try/catch` and return `{ success: false, error: ..., elapsed }` on failure. The coordinator calls `Promise.allSettled()` and unwraps results — a thrown exception produces a rejected promise, but a returned `{ success: false }` is the preferred pattern for expected failures.

## Step 2: Register with the coordinator

Open `src/analyzers/coordinator.ts`. Make three changes:

**1. Import your analyzer and result type:**

```typescript
import { analyzeLicense } from './license-scanner.js';
import type { LicenseResult } from './license-scanner.js';
```

**2. Add the analyzer name to `ANALYZER_NAMES`:**

```typescript
const ANALYZER_NAMES = [
  'file-tree',
  'dependencies',
  'git-history',
  'todos',
  'env',
  'ast',
  'tests',
  'docs',
  'license', // add your analyzer name here
] as const;
```

**3. Add an empty fallback and register in `Promise.allSettled()`:**

Add an empty fallback constant alongside the existing `EMPTY_*` constants:

```typescript
const EMPTY_LICENSE: LicenseResult = {
  licenseFile: null,
  licenseType: null,
  summary: { hasLicense: false, licenseType: null },
};
```

Add it to the `EMPTY_RESULTS` array (keeping index order matching `ANALYZER_NAMES`):

```typescript
const EMPTY_RESULTS = [
  EMPTY_FILE_TREE,
  EMPTY_DEPENDENCIES,
  EMPTY_GIT_HISTORY,
  EMPTY_TODOS,
  EMPTY_ENV,
  EMPTY_AST,
  EMPTY_TESTS,
  EMPTY_DOCS,
  EMPTY_LICENSE, // new
] as const;
```

Add your analyzer to the `Promise.allSettled()` call:

```typescript
const results = await Promise.allSettled([
  analyzeFileTree(ctx),
  analyzeDependencies(ctx),
  analyzeGitHistory(ctx),
  scanTodos(ctx),
  scanEnvVars(ctx),
  analyzeAST(ctx),
  analyzeTests(ctx),
  analyzeDocs(ctx),
  analyzeLicense(ctx), // new — must be at the same index as in ANALYZER_NAMES
]);
```

Unwrap the result (add after the `docs` unwrap call):

```typescript
const license = unwrap<LicenseResult>(results[8], 8, EMPTY_RESULTS[8]);
```

Include it in the returned `StaticAnalysisResult`:

```typescript
return {
  fileTree,
  dependencies,
  gitHistory,
  todos,
  env,
  ast,
  tests,
  docs,
  license,   // new
  metadata: { ... },
};
```

## Step 3: Define the output schema

If your analyzer produces structured data that renderers or AI rounds need, add a Zod schema to `src/analyzers/types.ts` (the existing pattern is defined there for all eight analyzers).

```typescript
// In src/analyzers/types.ts

export const LicenseResultSchema = z.object({
  licenseFile: z.string().nullable(),
  licenseType: z.string().nullable(),
  summary: z.object({
    hasLicense: z.boolean(),
    licenseType: z.string().nullable(),
  }),
});

export type LicenseResult = z.infer<typeof LicenseResultSchema>;
```

Also extend the `StaticAnalysisResultSchema` to include your new field:

```typescript
export const StaticAnalysisResultSchema = z.object({
  fileTree: FileTreeResultSchema,
  // ... existing fields ...
  docs: DocResultSchema,
  license: LicenseResultSchema,   // new
  metadata: z.object({ ... }),
});

export type StaticAnalysisResult = z.infer<typeof StaticAnalysisResultSchema>;
```

Because `StaticAnalysisResult` is inferred from the schema, adding the field to the schema automatically updates the TypeScript type. Run `npm run typecheck` to find any places that need updating.

## Step 4: Wire to renderers

If your analyzer data should appear in a generated document, update the relevant renderer. Each renderer receives a `RenderContext` (from `src/renderers/types.ts`) that includes `ctx.staticAnalysis` — the full `StaticAnalysisResult`.

After Step 3, your new field is accessible as `ctx.staticAnalysis.license` in any renderer. Pick the renderer that best fits your data and add a new section:

```typescript
// In src/renderers/render-07-dependencies.ts (example — pick the right renderer)
const license = ctx.staticAnalysis.license;

if (license.summary.hasLicense) {
  lines.push(`## License`);
  lines.push('');
  lines.push(`License: **${license.licenseType ?? 'Unknown'}**`);
  lines.push('');
}
```

If your analyzer warrants its own dedicated document, create a new renderer file following the `renderDocument()` pattern in `src/renderers/render-template.ts`, register it in `src/renderers/registry.ts`, and add it to the document table in `src/renderers/render-00-index.ts`.

## Step 5: Test

Run handover and verify the analyzer output appears:

```bash
# Static-only (no API cost) — verify the analyzer runs without errors
npm run dev -- generate --static-only

# Check the static analysis output file for your new data
cat handover/static-analysis.md

# Full run (with API key) — verify the data appears in rendered documents
ANTHROPIC_API_KEY=your-key npm run dev -- generate
```

Run the test suite:

```bash
npm test
```

To write a unit test for your analyzer, create `src/analyzers/license-scanner.test.ts`. Mock `AnalysisContext` with a list of synthetic `FileEntry` objects and assert on the returned `LicenseResult`. Look at existing test files in `src/analyzers/` for the pattern.
