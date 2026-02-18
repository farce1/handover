# Development

## Prerequisites

- **Node.js** >= 18.0.0 (check with `node --version`)
- **npm** >= 8 (bundled with Node; check with `npm --version`)
- **git** (for cloning and commit hooks)
- **An LLM API key** — the default provider is Anthropic; set `ANTHROPIC_API_KEY` in your environment. Other providers require their own key (see `src/providers/presets.ts` for the `apiKeyEnv` field of each provider). Integration tests require a real key.

## Setup

```bash
git clone https://github.com/farce1/handover.git
cd handover
npm install
npm run build
```

`npm run build` compiles TypeScript via tsup into `dist/`. If the build passes, your environment is set up correctly.

To verify the CLI is working end-to-end:

```bash
ANTHROPIC_API_KEY=your-key node dist/index.js --help
```

## Development workflow

For iterative development, use `tsx` to run TypeScript directly without a build step:

```bash
npm run dev -- generate --help
```

`npm run dev` invokes `tsx src/cli/index.ts`. You can pass any CLI arguments after `--`:

```bash
# Run generate against the repo itself (requires API key)
ANTHROPIC_API_KEY=your-key npm run dev -- generate

# Run static analysis only (no API key needed)
npm run dev -- generate --static-only

# Run with a different provider
OPENAI_API_KEY=your-key npm run dev -- generate --provider openai --model gpt-4o
```

**Typical inner loop:**

1. Edit source files in `src/`
2. Run `npm run dev -- generate --static-only` to verify static analysis changes (instant, no API cost)
3. Run `npm test` to run the unit test suite
4. For changes touching AI rounds or renderers, run the full pipeline with a real API key to verify output

## Testing

**Unit tests:**

```bash
npm test
```

Runs all `*.test.ts` files under `src/` using Vitest. No API key required.

**Run a specific test file:**

```bash
npm test -- src/analyzers/coordinator.test.ts
npm test -- src/orchestrator/dag.test.ts
```

**Integration tests:**

Integration tests call real LLM APIs and cost money. Gate them with the environment variable:

```bash
HANDOVER_INTEGRATION=1 ANTHROPIC_API_KEY=your-key npm test
```

Integration tests are skipped automatically when `HANDOVER_INTEGRATION` is not set.

**Coverage:**

```bash
npm test -- --coverage
```

Coverage reports are written to `coverage/` (which is gitignored). The CI pipeline reports to Codecov on Node 20.

## Linting and formatting

**Lint:**

```bash
npm run lint
```

Uses ESLint with flat config (`eslint.config.js`). The `--max-warnings 0` flag means any warning fails the check. Fix auto-fixable issues with:

```bash
npm run lint:fix
```

**Format:**

```bash
npm run format
```

Runs Prettier across all files. To check without writing:

```bash
npm run format:check
```

**Pre-commit hooks:**

Husky installs git hooks on `npm install`. The `pre-commit` hook runs lint-staged, which automatically lints and formats staged TypeScript/JavaScript files before every commit. This means you rarely need to run lint/format manually — it happens automatically.

**Commit messages:**

commitlint enforces [Conventional Commits](https://www.conventionalcommits.org/) format. Every commit message must start with a type: `feat`, `fix`, `test`, `refactor`, `chore`, `docs`, `ci`, `perf`, or `revert`. Example:

```
feat(providers): add Mistral provider preset
fix(dag): skip dependents when step is skipped, not just failed
```

The commit hook rejects messages that do not match.

## Building

**Compile to dist/:**

```bash
npm run build
```

Uses tsup to bundle TypeScript into `dist/index.js` (ESM, with type declarations). The `bin` field in `package.json` points to this file.

**Type check only (no emit):**

```bash
npm run typecheck
```

Runs `tsc --noEmit` against the project. Type errors appear here but not necessarily in tsup (tsup transpiles without type-checking). Run this before submitting a PR.

## Submitting a PR

1. **Branch** from `main`:

   ```bash
   git checkout -b feat/your-feature
   ```

2. **Make your changes**, committing atomically with conventional commit messages.

3. **Verify locally** before pushing:

   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```

4. **Push and open a PR.** The CI pipeline runs on Node 20 and 22:
   - Lint (`npm run lint`)
   - Type check (`npm run typecheck`)
   - Unit tests (`npm test`)
   - Build (`npm run build`)
   - CodeQL security scan
   - OpenSSF Scorecard (on main branch pushes)

5. **PR template checklist** — fill out the description, check that tests cover your change, and note if the PR changes any public API or config schema.

Release-please generates changelogs and release PRs automatically from merged conventional commits. You do not need to manage CHANGELOG.md manually.

## Debugging

**Run with verbose logging:**

```bash
npm run dev -- generate -v
```

The `-v` / `--verbose` flag enables `logger.setVerbose(true)`, which prints additional trace messages from the config loader, provider initialization, and context packing.

**Run with tsx for fast iteration (no build):**

```bash
# Inspect what the static analysis finds
npm run dev -- analyze --json | jq '.fileTree.filesByExtension'

# Estimate tokens and cost before running the full pipeline
ANTHROPIC_API_KEY=your-key npm run dev -- estimate

# Run only specific documents to save API cost during renderer development
ANTHROPIC_API_KEY=your-key npm run dev -- generate --only 01-PROJECT-OVERVIEW,03-ARCHITECTURE
```

**Inspect cached round results:**

Round results are cached in `.handover-cache/` in your working directory. To discard the cache and force fresh API calls:

```bash
ANTHROPIC_API_KEY=your-key npm run dev -- generate --no-cache
```

**Debug a specific analyzer:**

Each analyzer is a standalone async function. You can call it directly in a one-off script using `tsx`:

```bash
tsx -e "
  import { analyzeFileTree } from './src/analyzers/file-tree.ts';
  import { buildAnalysisContext } from './src/analyzers/context.ts';
  const ctx = await buildAnalysisContext(process.cwd(), {});
  const result = await analyzeFileTree(ctx);
  console.log(JSON.stringify(result, null, 2));
"
```
