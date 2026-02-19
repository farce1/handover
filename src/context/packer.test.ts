import { describe, expect, test, vi } from 'vitest';
import { packFiles, generateSignatureSummary, OVERSIZED_THRESHOLD_TOKENS } from './packer.js';
import type { FilePriority, TokenBudget } from './types.js';
import type { ASTResult } from '../analyzers/types.js';
import type { ParsedFile } from '../parsing/types.js';

// ─── Local factories ──────────────────────────────────────────────────────────

/** Deterministic 1-char = 1-token estimator */
const charTokens = (text: string): number => text.length;

/** Constructs a TokenBudget with typical overhead fields */
function mkBudget(fileContentBudget: number): TokenBudget {
  return {
    total: fileContentBudget + 7096,
    promptOverhead: 3000,
    outputReserve: 4096,
    fileContentBudget,
  };
}

/** Constructs a scored file with zeroed breakdown */
function mkScored(path: string, score: number): FilePriority {
  return {
    path,
    score,
    breakdown: {
      entryPoint: 0,
      importCount: 0,
      exportCount: 0,
      gitActivity: 0,
      edgeCases: 0,
      configFile: 0,
    },
  };
}

/** Empty ASTResult with no files */
const emptyAST: ASTResult = {
  files: [],
  summary: {
    totalFunctions: 0,
    totalClasses: 0,
    totalExports: 0,
    totalImports: 0,
    languageBreakdown: {},
  },
};

/** Returns a base ParsedFile shape with all required fields, merged with overrides */
function mkParsedFile(overrides: Partial<ParsedFile> = {}): ParsedFile {
  return {
    path: 'src/default.ts',
    language: 'typescript',
    parserUsed: 'tree-sitter',
    functions: [],
    classes: [],
    imports: [],
    exports: [],
    constants: [],
    reExports: [],
    lineCount: 10,
    parseErrors: [],
    ...overrides,
  };
}

/** Returns a vi.fn() that resolves to map[path] or rejects for unknown paths */
function mkContentFn(map: Record<string, string>): (path: string) => Promise<string> {
  return vi.fn(async (path: string) => {
    if (path in map) return map[path];
    throw new Error(`Unknown path: ${path}`);
  });
}

/** Wraps files array with zeroed summary */
function mkASTResult(files: ParsedFile[]): ASTResult {
  return {
    files,
    summary: {
      totalFunctions: 0,
      totalClasses: 0,
      totalExports: 0,
      totalImports: 0,
      languageBreakdown: {},
    },
  };
}

// ─── packFiles() tests ────────────────────────────────────────────────────────

describe('packFiles', () => {
  test('empty input guard: returns zeros with no files', async () => {
    const result = await packFiles([], emptyAST, mkBudget(10000), charTokens, mkContentFn({}));
    expect(result.files.length).toBe(0);
    expect(result.metadata.totalFiles).toBe(0);
    expect(result.metadata.usedTokens).toBe(0);
    expect(result.metadata.utilizationPercent).toBe(0);
  });

  test('small-project fast-path: all files get tier full when total fits in budget', async () => {
    const contentFn = mkContentFn({ 'a.ts': 'a'.repeat(100), 'b.ts': 'b'.repeat(100) });
    const scored = [mkScored('a.ts', 50), mkScored('b.ts', 40)];

    // total = 200 <= budget 10000 → fast-path
    const result = await packFiles(scored, emptyAST, mkBudget(10000), charTokens, contentFn);

    expect(result.files.every((f) => f.tier === 'full')).toBe(true);
    expect(result.metadata.fullFiles).toBe(2);
    expect(result.metadata.skippedFiles).toBe(0);
    expect(result.metadata.signatureFiles).toBe(0);
  });

  test('changed file forced full: changed file gets full tier in greedy path', async () => {
    // b.ts has higher score → processed first via changed-file path → gets full
    // a.ts has lower score → processed second → falls to non-full if no budget
    // total = 100 + 50 = 150, budget = 140 → greedy (150 > 140)
    // b.ts changed (score=90, 50 tokens ≤ 140 remaining) → full, remaining = 90
    // a.ts (score=10, 100 tokens > 90 remaining) → no AST → fallback (longer than 90) → skip
    const contentFn = mkContentFn({ 'a.ts': 'a'.repeat(100), 'b.ts': 'b'.repeat(50) });

    const result = await packFiles(
      [mkScored('b.ts', 90), mkScored('a.ts', 10)],
      emptyAST,
      mkBudget(140),
      charTokens,
      contentFn,
      new Set(['b.ts']),
    );

    const bResult = result.files.find((f) => f.path === 'b.ts');
    expect(bResult?.tier).toBe('full');
  });

  test('changed file exceeds remaining budget falls through to non-full tier', async () => {
    // 1 changed file of 500 chars, budget of 100 → falls through (500 > 100)
    // no AST → fallback; fallback size > 100 → skip
    const contentFn = mkContentFn({ 'big.ts': 'x'.repeat(500) });

    const result = await packFiles(
      [mkScored('big.ts', 50)],
      emptyAST,
      mkBudget(100),
      charTokens,
      contentFn,
      new Set(['big.ts']),
    );

    const bigResult = result.files.find((f) => f.path === 'big.ts');
    expect(bigResult?.tier).not.toBe('full');
  });

  test('oversized file: signatures + all sections fit → tier full with section markers', async () => {
    // fullTokens > OVERSIZED_THRESHOLD_TOKENS (8000), score >= 30, parsed AST exists
    // Use two files so total > budget forcing greedy path, while budget is large enough for sig+sections
    // big.ts = 8001 chars (oversized), pad.ts = 100 chars
    // total = 8101, budget = 8060 → greedy (8101 > 8060)
    // big.ts processed first (score=50 > pad.ts score=10)
    // fullTokens(8001) > OVERSIZED_THRESHOLD_TOKENS(8000) AND score(50)>=30 AND parsed → oversized path
    // sigTokens ≈ 65, sectionContent = contentLines.slice(0,5) joined
    //   fileContent is 8001 'x' on one line, so contentLines=['xxx...xxx', '', '', '', '']
    //   sectionContent length = 8001 + 4 = 8005 tokens
    // sigTokens(65) + totalSectionTokens(8005) = 8070 > remaining(8060) → does NOT fit all sections
    // So falls into greedy subset: sectionBudget = 8060-65=7995; section(8005>7995) → no sections fit
    // → tier='signatures', no section markers
    // To get ALL sections to fit: budget must be >= 65 + 8005 = 8070 + some extra for combined tokens
    // combinedTokens = estimate('signatures\n\n// --- Export: exportedFn ---\n<content>')
    // Use budget = 20000 BUT ensure total > 20000 to force greedy
    // Add a large padding file: pad.ts = 12001 chars → total = 8001+12001 = 20002 > 20000 → greedy
    // remaining starts at 20000; big.ts oversized:
    //   sigTokens(65) + sectionTokens(8005) = 8070 ≤ 20000 → fits ALL sections → tier='full' with '// ---'
    const fileContent = 'x'.repeat(OVERSIZED_THRESHOLD_TOKENS + 1); // 8001 chars
    const padContent = 'p'.repeat(12001); // forces total(20002) > budget(20000)
    const parsedFile = mkParsedFile({
      path: 'big.ts',
      lineCount: 100,
      functions: [
        {
          kind: 'function',
          name: 'exportedFn',
          parameters: [],
          returnType: 'void',
          typeParameters: [],
          isAsync: false,
          isGenerator: false,
          visibility: 'public',
          decorators: [],
          line: 1,
          endLine: 5,
        },
      ],
      exports: [
        { name: 'exportedFn', kind: 'function', isReExport: false, isTypeOnly: false, line: 1 },
      ],
    });
    const astResult = mkASTResult([parsedFile]);
    const contentFn = mkContentFn({ 'big.ts': fileContent, 'pad.ts': padContent });

    const result = await packFiles(
      [mkScored('big.ts', 50), mkScored('pad.ts', 10)],
      astResult,
      mkBudget(20000),
      charTokens,
      contentFn,
    );

    const bigResult = result.files.find((f) => f.path === 'big.ts');
    expect(bigResult?.tier).toBe('full');
    expect(bigResult?.content).toContain('// ---');
  });

  test('oversized file: greedy section subset → tier signatures', async () => {
    // oversized file; budget fits signatures but section content is too large to fully include
    // fileContent = 8100 'x' chars (one long line)
    // function body lines 1..50 → contentLines.slice(0,50) = ['xxx...xxx'] (just line 0 = 8100 chars)
    // sigTokens ≈ 65 (header + function sig)
    // sectionContent ≈ 8100 tokens (too big for tight budget)
    // budget = 200: sigTokens(65) ≤ 200 → tries sections; remaining=135; section(8100>135) → 0 sections fit
    // includedSections=[] → combinedContent = signatures → tier='signatures'
    const fileContent = 'x'.repeat(OVERSIZED_THRESHOLD_TOKENS + 100);
    const parsedFile = mkParsedFile({
      path: 'big.ts',
      lineCount: 200,
      functions: [
        {
          kind: 'function',
          name: 'exportedFn',
          parameters: [],
          returnType: 'void',
          typeParameters: [],
          isAsync: false,
          isGenerator: false,
          visibility: 'public',
          decorators: [],
          line: 1,
          endLine: 50,
        },
      ],
      exports: [
        { name: 'exportedFn', kind: 'function', isReExport: false, isTypeOnly: false, line: 1 },
      ],
    });
    const astResult = mkASTResult([parsedFile]);
    const contentFn = mkContentFn({ 'big.ts': fileContent });

    const result = await packFiles(
      [mkScored('big.ts', 50)],
      astResult,
      mkBudget(200),
      charTokens,
      contentFn,
    );

    const bigResult = result.files.find((f) => f.path === 'big.ts');
    expect(bigResult?.tier).toBe('signatures');
  });

  test('oversized file: signatures only, no section markers in content', async () => {
    // Same oversized setup, budget = 100: sig(~65) ≤ 100 → greedy sections; no section fits
    // includedSections=[] → combinedContent = signatures only → no '// ---'
    const fileContent = 'x'.repeat(OVERSIZED_THRESHOLD_TOKENS + 100);
    const parsedFile = mkParsedFile({
      path: 'big.ts',
      lineCount: 200,
      functions: [
        {
          kind: 'function',
          name: 'exportedFn',
          parameters: [],
          returnType: 'void',
          typeParameters: [],
          isAsync: false,
          isGenerator: false,
          visibility: 'public',
          decorators: [],
          line: 1,
          endLine: 50,
        },
      ],
      exports: [
        { name: 'exportedFn', kind: 'function', isReExport: false, isTypeOnly: false, line: 1 },
      ],
    });
    const astResult = mkASTResult([parsedFile]);
    const contentFn = mkContentFn({ 'big.ts': fileContent });

    const result = await packFiles(
      [mkScored('big.ts', 50)],
      astResult,
      mkBudget(100),
      charTokens,
      contentFn,
    );

    const bigResult = result.files.find((f) => f.path === 'big.ts');
    expect(bigResult?.tier).toBe('signatures');
    expect(bigResult?.content).not.toContain('// ---');
  });

  test('normal file: full content when fits in budget', async () => {
    const content = 'hello world test content';
    const contentFn = mkContentFn({ 'simple.ts': content });

    const result = await packFiles(
      [mkScored('simple.ts', 50)],
      emptyAST,
      mkBudget(500),
      charTokens,
      contentFn,
    );

    const fileResult = result.files.find((f) => f.path === 'simple.ts');
    expect(fileResult?.tier).toBe('full');
    expect(fileResult?.content).toBe(content);
  });

  test('normal file: AST signatures fallback when full content does not fit', async () => {
    // first.ts(400) consumes most of budget; second.ts(200) does not fit as full
    // second.ts has AST → signature summary fits in remaining budget
    // budget=460: total(600)>460 → greedy; first(400→full, remaining=60)
    // second(200>60) → AST sig ≈ 52 chars ≤ 60 → tier='signatures'
    const firstContent = 'a'.repeat(400);
    const secondContent = 'b'.repeat(200);
    const parsedSecond = mkParsedFile({
      path: 'second.ts',
      lineCount: 10,
      functions: [
        {
          kind: 'function',
          name: 'myFunc',
          parameters: [],
          returnType: undefined,
          typeParameters: [],
          isAsync: false,
          isGenerator: false,
          visibility: 'public',
          decorators: [],
          line: 1,
          endLine: 5,
        },
      ],
      exports: [
        { name: 'myFunc', kind: 'function', isReExport: false, isTypeOnly: false, line: 1 },
      ],
    });
    const astResult = mkASTResult([parsedSecond]);
    const contentFn = mkContentFn({ 'first.ts': firstContent, 'second.ts': secondContent });

    const result = await packFiles(
      [mkScored('first.ts', 90), mkScored('second.ts', 10)],
      astResult,
      mkBudget(460),
      charTokens,
      contentFn,
    );

    const secondResult = result.files.find((f) => f.path === 'second.ts');
    expect(secondResult?.tier).toBe('signatures');
    expect(secondResult?.content).toContain('// FILE:');
  });

  test('normal file: non-AST first-20-lines fallback when no AST entry', async () => {
    // second.ts has no AST entry → uses fallback summary (first 20 lines)
    // Must force greedy path: total must exceed budget
    // first.ts=400, second.ts='line1\nline2\nline3'(17 chars), total=417 → budget must be < 417
    // budget=410: total(417)>410 → greedy; first(400>410? No, 400<=410)→full, remaining=10
    // second(17>10) → no AST → fallback; fallback size > 10 → skip (not signatures)
    // Need remaining large enough for fallback but small enough that full(17) would not fit via non-full path
    // Actually second.ts full=17, that fits in remaining=10? No, 17>10.
    // Fallback = '// FILE: second.ts (3 lines)\n// line1\n// line2\n// line3' = let's count:
    //   '// FILE: second.ts (3 lines)' = 29 chars
    //   '\n// line1' = 9, '\n// line2' = 9, '\n// line3' = 9 → total ≈ 56 chars
    // Need remaining >= 56 after first.ts
    // remaining = budget - 400 >= 56 → budget >= 456
    // But total = 400+17=417 < 456 → fast-path! Contradiction.
    // Solution: make second.ts content larger so total > budget while remaining still fits fallback
    // second.ts content = 100 chars of 'b', total = 500, budget = 460: greedy; first(400→full, remaining=60)
    // second(100>60) → no AST → fallback:
    //   fileContent = 'bbb...' (100 chars on one line)
    //   fallback = '// FILE: second.ts (1 lines)\n// bbb...' = 29 + '\n// ' + 100 = 29+1+3+100 = 133 chars > 60 → skip
    // Need shorter fallback. Use second.ts content with short lines:
    // second.ts = 'ab\ncd' (5 chars, 2 lines). fallback = '// FILE: second.ts (2 lines)\n// ab\n// cd' = 41 chars
    // total = 400+5=405, budget=400: greedy(405>400); first(400→full, remaining=0); second(5>0) → fallback(41>0) → skip
    // budget=401: greedy(405>401); first(400→full, remaining=1); second(5>1) → fallback(41>1) → skip
    // Need budget where remaining after first >= fallback size
    // remaining = budget - 400; fallback ≈ 41; need budget-400 >= 41 → budget >= 441
    // But total = 400+5=405 < 441 → fast-path!
    // The only solution: make first.ts much larger than budget but that prevents its own full tier
    // OR: use 3 files where a middle file forces total > budget while leaving room for fallback
    // files: alpha.ts(400), beta.ts(50), second.ts(short content)
    // total = 400+50+short, budget = 445: 400+50+short > 445 if short>(-5)... always true
    // alpha(400→full, remaining=45); beta(50>45) → no AST → fallback; fallback for 'bbb'x50 = big
    // Try: alpha.ts=400, second.ts='ab\ncd' (5 chars), extra.ts=100 chars
    // total=505, budget=450: greedy; alpha(400→full, remaining=50); extra(100>50)→no AST→fallback for 100 chars='// FILE...\n// bbb...' ≈ 130>50→skip; second(5≤50)→full (not signatures!)
    // The non-AST fallback is only tried when full doesn't fit! second.ts(5) ≤ remaining(50) → full
    // Need second.ts to be large enough not to fit as full but with fallback that fits
    // second.ts=200 'b' chars. fallback≈232 chars (header+line). remaining=50. fallback(232>50)→skip
    // second.ts=60 'b' on many lines. Content='b\n'*30 = 60 chars, 30 lines. total=400+100+60=560, budget=500
    // greedy: alpha(400→full, remaining=100); extra(100→full, remaining=0); second(60>0)→skip
    // Hmm. Need: remaining after previous files >= fallback of second but < full of second
    // fallback of second = '// FILE: second.ts (N lines)\n// line1\n...'
    // For second to use non-AST fallback: fullTokens > remaining AND fallbackTokens ≤ remaining
    // Make second.ts content = 200 chars in short lines: 'ab\n'*66 = 198 chars, 66 lines
    // fallback = header + first 20 lines + '... (46 more lines)'
    //   = '// FILE: second.ts (66 lines)' + 20 × '// ab' + '// ... (46 more lines)' ≈ 30+20*6+24=174 chars
    // Need: fullTokens(198) > remaining AND fallback(174) ≤ remaining → remaining in [174, 197]
    // remaining = budget - sum_of_previous. Use: alpha.ts=400, extra.ts=50, budget=625
    // total=400+50+198=648>625→greedy; alpha(400→full, remaining=225); extra(50→full, remaining=175)
    // second(198>175)→no AST→fallback(174≤175)→signatures ✓
    const firstContent = 'a'.repeat(400);
    const extraContent = 'e'.repeat(50);
    const secondContent = 'ab\n'.repeat(66); // 198 chars, 66 lines
    const contentFn = mkContentFn({
      'first.ts': firstContent,
      'extra.ts': extraContent,
      'second.ts': secondContent,
    });

    // total=648>625 → greedy; first(400→full,rem=225); extra(50→full,rem=175); second(198>175)→fallback(~174≤175)→signatures
    const result = await packFiles(
      [mkScored('first.ts', 90), mkScored('extra.ts', 50), mkScored('second.ts', 10)],
      emptyAST,
      mkBudget(625),
      charTokens,
      contentFn,
    );

    const secondResult = result.files.find((f) => f.path === 'second.ts');
    expect(secondResult?.tier).toBe('signatures');
    expect(secondResult?.content).toContain('// FILE:');
  });

  test('file read failure: rejected promise produces tier skip with tokens 0', async () => {
    // bad.ts fails to read → contentMap won't contain it → tier='skip' in greedy path
    // Need to force greedy path: include a good.ts that makes total > budget
    // good.ts = 200 chars, bad.ts fails (0 in contentMap), total from contentMap = 200
    // budget = 150: total(200) > 150 → greedy
    // bad.ts processed first (score=90): content=undefined → skip ✓
    // good.ts processed second (score=10): 200>remaining(150)... wait remaining starts at budget=150
    // Actually after bad.ts (skip, no deduction), remaining=150; good.ts(200>150)→skip too
    // Make good.ts=100 so it fits: good(100→full, remaining=50); bad.ts processed after (lower score)
    // Wait, bad.ts score=50, good.ts score=10 → bad.ts processed first
    // bad.ts: content=undefined → skip. remaining stays at 150.
    // good.ts (score=10, 100 tokens ≤ 150) → full.
    // total from contentMap = 100 (only good.ts), total(100) < 150 → fast-path!
    // The fast-path uses contentMap.get() which returns undefined for bad.ts → '' (empty) → tier='full', tokens=0
    // Fast-path produces 'full' for bad.ts with empty content, not 'skip'
    // To force greedy: total of contentMap entries must exceed budget
    // good.ts = 200 chars in contentMap, budget=150: total(200)>150 → greedy ✓
    // bad.ts (fails) processed first: content=undefined → tier='skip' ✓
    const contentFn = vi.fn(async (path: string): Promise<string> => {
      if (path === 'bad.ts') throw new Error('ENOENT: file not found');
      if (path === 'good.ts') return 'g'.repeat(200);
      throw new Error(`Unknown path: ${path}`);
    });

    // total from contentMap = 200 (only good.ts read), budget=150: 200>150 → greedy
    const result = await packFiles(
      [mkScored('bad.ts', 90), mkScored('good.ts', 10)],
      emptyAST,
      mkBudget(150),
      charTokens,
      contentFn,
    );

    const badResult = result.files.find((f) => f.path === 'bad.ts');
    expect(badResult?.tier).toBe('skip');
    expect(badResult?.tokens).toBe(0);
  });

  test('budget exactly exhausted: usedTokens equals budgetTokens and utilizationPercent is 100', async () => {
    // File content exactly equals budget → fast-path (total ≤ budget)
    const content = 'x'.repeat(500);
    const contentFn = mkContentFn({ 'exact.ts': content });

    const result = await packFiles(
      [mkScored('exact.ts', 50)],
      emptyAST,
      mkBudget(500),
      charTokens,
      contentFn,
    );

    expect(result.metadata.usedTokens).toBe(result.metadata.budgetTokens);
    expect(result.metadata.utilizationPercent).toBe(100);
  });

  test('budget boundary: file 1 char over budget falls to non-full tier', async () => {
    // Greedy path: first.ts(100)→full, remaining=50; second.ts(101>50) → non-full
    const firstContent = 'a'.repeat(100);
    const secondContent = 'b'.repeat(101);
    const contentFn = mkContentFn({ 'first.ts': firstContent, 'second.ts': secondContent });

    // total=201 > budget=150 → greedy path
    const result = await packFiles(
      [mkScored('first.ts', 90), mkScored('second.ts', 10)],
      emptyAST,
      mkBudget(150),
      charTokens,
      contentFn,
    );

    const secondResult = result.files.find((f) => f.path === 'second.ts');
    expect(secondResult?.tier).not.toBe('full');
  });
});

// ─── generateSignatureSummary() tests ────────────────────────────────────────

describe('generateSignatureSummary', () => {
  test('header line: contains correct file path and line count', () => {
    const parsed = mkParsedFile({ path: 'src/foo.ts', lineCount: 99 });
    const result = generateSignatureSummary(parsed);
    expect(result).toContain('// FILE: src/foo.ts (99 lines)');
  });

  test('exported async function with typed params and return type', () => {
    const parsed = mkParsedFile({
      path: 'src/date.ts',
      lineCount: 20,
      functions: [
        {
          kind: 'function',
          name: 'formatDate',
          parameters: [
            { name: 'date', type: 'Date', isRest: false },
            { name: 'format', type: 'string', isRest: false },
          ],
          returnType: 'string',
          typeParameters: [],
          isAsync: true,
          isGenerator: false,
          visibility: 'public',
          decorators: [],
          line: 1,
          endLine: 5,
        },
      ],
      exports: [
        { name: 'formatDate', kind: 'function', isReExport: false, isTypeOnly: false, line: 1 },
      ],
    });
    const result = generateSignatureSummary(parsed);
    expect(result).toContain(
      'export async function formatDate(date: Date, format: string): string',
    );
  });

  test('exported sync function without return type', () => {
    const parsed = mkParsedFile({
      path: 'src/thing.ts',
      lineCount: 10,
      functions: [
        {
          kind: 'function',
          name: 'doThing',
          parameters: [{ name: 'x', isRest: false }],
          returnType: undefined,
          typeParameters: [],
          isAsync: false,
          isGenerator: false,
          visibility: 'public',
          decorators: [],
          line: 1,
          endLine: 3,
        },
      ],
      exports: [
        { name: 'doThing', kind: 'function', isReExport: false, isTypeOnly: false, line: 1 },
      ],
    });
    const result = generateSignatureSummary(parsed);
    expect(result).toContain('export function doThing(x)');
    // no return type suffix
    expect(result).not.toContain('doThing(x):');
  });

  test('non-exported function is excluded from output', () => {
    const parsed = mkParsedFile({
      path: 'src/private.ts',
      lineCount: 10,
      functions: [
        {
          kind: 'function',
          name: 'internalHelper',
          parameters: [],
          returnType: 'void',
          typeParameters: [],
          isAsync: false,
          isGenerator: false,
          visibility: 'public',
          decorators: [],
          line: 1,
          endLine: 3,
        },
      ],
      exports: [], // NOT exported
    });
    const result = generateSignatureSummary(parsed);
    expect(result).not.toContain('internalHelper');
  });

  test('exported class with public methods', () => {
    const parsed = mkParsedFile({
      path: 'src/logger.ts',
      lineCount: 30,
      classes: [
        {
          kind: 'class',
          name: 'MyClass',
          typeParameters: [],
          extends: [],
          implements: [],
          mixins: [],
          fields: [],
          methods: [
            {
              kind: 'function',
              name: 'method',
              parameters: [{ name: 'p', type: 'T', isRest: false }],
              returnType: 'R',
              typeParameters: [],
              isAsync: false,
              isGenerator: false,
              visibility: 'public',
              decorators: [],
              line: 5,
              endLine: 8,
            },
          ],
          decorators: [],
          visibility: 'public',
          line: 1,
          endLine: 20,
        },
      ],
      exports: [{ name: 'MyClass', kind: 'class', isReExport: false, isTypeOnly: false, line: 1 }],
    });
    const result = generateSignatureSummary(parsed);
    expect(result).toContain('export class MyClass { method(p: T): R }');
  });

  test('class private methods are excluded from output', () => {
    const parsed = mkParsedFile({
      path: 'src/service.ts',
      lineCount: 20,
      classes: [
        {
          kind: 'class',
          name: 'Service',
          typeParameters: [],
          extends: [],
          implements: [],
          mixins: [],
          fields: [],
          methods: [
            {
              kind: 'function',
              name: 'privateMethod',
              parameters: [],
              returnType: 'void',
              typeParameters: [],
              isAsync: false,
              isGenerator: false,
              visibility: 'private',
              decorators: [],
              line: 3,
              endLine: 6,
            },
          ],
          decorators: [],
          visibility: 'public',
          line: 1,
          endLine: 15,
        },
      ],
      exports: [{ name: 'Service', kind: 'class', isReExport: false, isTypeOnly: false, line: 1 }],
    });
    const result = generateSignatureSummary(parsed);
    expect(result).not.toContain('privateMethod');
  });

  test('exported constant with type annotation', () => {
    const parsed = mkParsedFile({
      path: 'src/constants.ts',
      lineCount: 5,
      constants: [
        {
          kind: 'constant',
          name: 'MAX_SIZE',
          type: 'number',
          isExported: true,
          line: 1,
        },
      ],
    });
    const result = generateSignatureSummary(parsed);
    expect(result).toContain('export const MAX_SIZE: number');
  });

  test('exported constant without type annotation', () => {
    const parsed = mkParsedFile({
      path: 'src/constants.ts',
      lineCount: 5,
      constants: [
        {
          kind: 'constant',
          name: 'DEFAULT_NAME',
          isExported: true,
          line: 1,
        },
      ],
    });
    const result = generateSignatureSummary(parsed);
    expect(result).toContain('export const DEFAULT_NAME');
    expect(result).not.toContain('export const DEFAULT_NAME:');
  });

  test('non-exported constant is excluded from output', () => {
    const parsed = mkParsedFile({
      path: 'src/internal.ts',
      lineCount: 5,
      constants: [
        {
          kind: 'constant',
          name: 'INTERNAL_LIMIT',
          type: 'number',
          isExported: false,
          line: 1,
        },
      ],
    });
    const result = generateSignatureSummary(parsed);
    expect(result).not.toContain('INTERNAL_LIMIT');
  });

  test('import summary line: 2 imports shows correct count and sources', () => {
    const parsed = mkParsedFile({
      path: 'src/consumer.ts',
      lineCount: 10,
      imports: [
        { source: './types', specifiers: [], isTypeOnly: false, line: 1 },
        { source: 'lodash', specifiers: [], isTypeOnly: false, line: 2 },
      ],
    });
    const result = generateSignatureSummary(parsed);
    expect(result).toContain('// 2 imports from: ./types, lodash');
  });

  test('no imports: no import summary line in output', () => {
    const parsed = mkParsedFile({ path: 'src/standalone.ts', lineCount: 5, imports: [] });
    const result = generateSignatureSummary(parsed);
    expect(result).not.toContain('imports from');
  });

  test('all sections together: function, class, constant, and imports all appear', () => {
    const parsed = mkParsedFile({
      path: 'src/all.ts',
      lineCount: 50,
      functions: [
        {
          kind: 'function',
          name: 'myFunc',
          parameters: [],
          returnType: 'boolean',
          typeParameters: [],
          isAsync: false,
          isGenerator: false,
          visibility: 'public',
          decorators: [],
          line: 1,
          endLine: 5,
        },
      ],
      classes: [
        {
          kind: 'class',
          name: 'MyClass',
          typeParameters: [],
          extends: [],
          implements: [],
          mixins: [],
          fields: [],
          methods: [],
          decorators: [],
          visibility: 'public',
          line: 10,
          endLine: 20,
        },
      ],
      constants: [
        {
          kind: 'constant',
          name: 'MY_CONST',
          type: 'string',
          isExported: true,
          line: 25,
        },
      ],
      imports: [{ source: './dep', specifiers: [], isTypeOnly: false, line: 1 }],
      exports: [
        { name: 'myFunc', kind: 'function', isReExport: false, isTypeOnly: false, line: 1 },
        { name: 'MyClass', kind: 'class', isReExport: false, isTypeOnly: false, line: 10 },
      ],
    });
    const result = generateSignatureSummary(parsed);
    expect(result.startsWith('// FILE: src/all.ts')).toBe(true);
    expect(result).toContain('export function myFunc(): boolean');
    expect(result).toContain('export class MyClass');
    expect(result).toContain('export const MY_CONST: string');
    expect(result).toContain('// 1 imports from: ./dep');
  });
});
