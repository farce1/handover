import type { EnvResult } from './types.js';

/**
 * Pure environment-variable parsing (no I/O), extracted from the filesystem
 * scanner so the detection rules are unit-testable.
 */

// Regex for env var usage in various languages
// - JS/TS:  process.env.VAR_NAME
// - Python: os.environ["VAR_NAME"] or os.getenv("VAR_NAME")
// - Rust:   env::var("VAR_NAME")
// - Go:     os.Getenv("VAR_NAME")
const ENV_REFERENCE_REGEX = new RegExp(
  [
    'process\\.env\\.([A-Z_][A-Z0-9_]*)',
    'os\\.environ\\[[\'"]([A-Z_][A-Z0-9_]*)[\'"]\\]',
    'os\\.getenv\\([\'"]([A-Z_][A-Z0-9_]*)[\'"]\\)',
    'env::var\\([\'"]([A-Z_][A-Z0-9_]*)[\'"]\\)',
    'os\\.Getenv\\([\'"]([A-Z_][A-Z0-9_]*)[\'"]\\)',
  ].join('|'),
  'g',
);

// Regex for variable definitions in .env files
const ENV_VAR_DEFINITION = /^([A-Z_][A-Z0-9_]*)=/;

/** Extract env-var references from source content across JS/TS, Python, Rust, and Go. */
export function scanContentForEnvRefs(
  content: string,
  filePath: string,
): EnvResult['envReferences'] {
  const refs: EnvResult['envReferences'] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    ENV_REFERENCE_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = ENV_REFERENCE_REGEX.exec(lines[i])) !== null) {
      // Find which capture group matched (groups 1-5 correspond to the 5 patterns)
      const variable = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
      if (variable) {
        refs.push({ file: filePath, line: i + 1, variable });
      }
    }
  }

  return refs;
}

/** Extract variable names defined in a .env file's content. */
export function parseEnvFileVars(content: string): string[] {
  const variables: string[] = [];
  for (const line of content.split('\n')) {
    const match = ENV_VAR_DEFINITION.exec(line.trim());
    if (match) {
      variables.push(match[1]);
    }
  }
  return variables;
}
