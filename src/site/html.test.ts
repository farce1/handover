import { describe, it, expect } from 'vitest';
import { parseFrontMatter, markdownToHtml, rewriteMdLinks, buildSite } from './html.js';

describe('parseFrontMatter', () => {
  it('extracts the title and strips the front-matter block', () => {
    const { title, body } = parseFrontMatter('---\ntitle: My Doc\nfoo: bar\n---\n# Heading\n');

    expect(title).toBe('My Doc');
    expect(body.trim()).toBe('# Heading');
  });

  it('returns the original body when there is no front-matter', () => {
    const { title, body } = parseFrontMatter('# Heading\n');

    expect(title).toBeUndefined();
    expect(body).toBe('# Heading\n');
  });

  it('tolerates malformed front-matter without a title', () => {
    const { title, body } = parseFrontMatter('---\ntitle: [unclosed\n---\n# Body\n');

    expect(title).toBeUndefined();
    expect(body.trim()).toBe('# Body');
  });
});

describe('markdownToHtml', () => {
  it('renders standard markdown', () => {
    expect(markdownToHtml('# Hello')).toContain('Hello</h1>');
  });

  it('renders mermaid fences as a mermaid container, not a code block', () => {
    const html = markdownToHtml('```mermaid\ngraph LR\n  a --> b\n```\n');

    expect(html).toContain('<pre class="mermaid">');
    expect(html).toContain('a --> b');
    expect(html).not.toContain('language-mermaid');
  });

  it('escapes raw HTML so doc content cannot inject markup into the hosted site', () => {
    const html = markdownToHtml('hello <script>alert(1)</script> and <img src=x onerror=alert(1)>');

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('drops HTML comments such as the ai:structured markers', () => {
    expect(markdownToHtml('<!-- ai:structured -->\n\nbody')).not.toContain('ai:structured');
  });
});

describe('rewriteMdLinks', () => {
  it('rewrites relative .md links to .html, preserving anchors', () => {
    expect(rewriteMdLinks('<a href="06-MODULES.md">m</a>')).toBe('<a href="06-MODULES.html">m</a>');
    expect(rewriteMdLinks('<a href="06-MODULES.md#api">m</a>')).toBe(
      '<a href="06-MODULES.html#api">m</a>',
    );
  });

  it('leaves external links untouched', () => {
    const html = '<a href="https://example.com/readme.md">x</a>';
    expect(rewriteMdLinks(html)).toBe(html);
  });
});

describe('buildSite', () => {
  const docs = [
    {
      filename: '00-INDEX.md',
      markdown: '---\ntitle: Index\n---\n# Welcome\n\n[Modules](06-MODULES.md)\n',
    },
    { filename: '06-MODULES.md', markdown: '# Modules\n' },
  ];

  it('maps each markdown doc to a standalone HTML page', () => {
    const pages = buildSite(docs);

    expect(pages.map((p) => p.filename)).toEqual(['00-INDEX.html', '06-MODULES.html']);
    expect(pages[0].html).toContain('<!doctype html>');
    expect(pages[0].html).toContain('<title>Index</title>');
    expect(pages[0].html).toContain('Welcome</h1>');
  });

  it('rewrites internal doc links to their HTML pages', () => {
    const index = buildSite(docs)[0].html;

    expect(index).toContain('href="06-MODULES.html"');
  });

  it('renders a shared nav linking every page, titled from front-matter or filename', () => {
    const index = buildSite(docs)[0].html;

    expect(index).toContain('href="00-INDEX.html"');
    expect(index).toContain('href="06-MODULES.html"');
    // 06-MODULES.md has no front-matter title -> derived from the filename.
    expect(index).toContain('Modules');
  });
});
