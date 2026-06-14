import { Marked } from 'marked';
import { parse as parseYaml } from 'yaml';

// ─── Markdown → HTML ─────────────────────────────────────────────────────────

const marked = new Marked({ gfm: true });
// Render ```mermaid fences as a mermaid container so the client script can draw
// them; everything else falls through to marked's default renderer.
marked.use({
  renderer: {
    code({ text, lang }) {
      if ((lang ?? '').trim() === 'mermaid') {
        return `<pre class="mermaid">${text}</pre>\n`;
      }
      return false;
    },
    // Doc content derives from arbitrary codebases and the site is meant to be
    // hosted, so never pass raw HTML through: drop comments, escape the rest.
    html({ text }) {
      if (/^<!--[\s\S]*-->\s*$/.test(text.trim())) return '';
      return escapeHtml(text);
    },
  },
});

/** Convert a markdown string to HTML, rendering mermaid fences as diagrams. */
export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

// ─── Front-matter ────────────────────────────────────────────────────────────

/** Split a leading YAML front-matter block from the body, extracting `title`. */
export function parseFrontMatter(md: string): { title?: string; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(md);
  if (!match) return { body: md };

  let title: string | undefined;
  try {
    const data = parseYaml(match[1]) as Record<string, unknown> | null;
    if (data && typeof data.title === 'string') title = data.title;
  } catch {
    // Malformed front-matter: treat as no title, keep the body after the block.
  }

  return { title, body: md.slice(match[0].length) };
}

// ─── Link rewriting ──────────────────────────────────────────────────────────

/** Rewrite relative `.md` links to `.html` so the static site is browsable. */
export function rewriteMdLinks(html: string): string {
  return html.replace(/href="([^"]+)\.md(#[^"]*)?"/g, (full, path: string, anchor?: string) => {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return full; // external URL
    return `href="${path}.html${anchor ?? ''}"`;
  });
}

// ─── Page assembly ───────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Title from the filename when front-matter has none: "06-MODULES.md" → "Modules". */
function deriveTitle(filename: string): string {
  return filename
    .replace(/\.md$/i, '')
    .replace(/^\d+[-_]/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const PAGE_CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.layout { display: flex; align-items: flex-start; }
.sidebar { position: sticky; top: 0; height: 100vh; overflow-y: auto; min-width: 16rem;
  padding: 1.5rem 1rem; border-right: 1px solid rgba(128,128,128,0.3); }
.sidebar ul { list-style: none; margin: 0; padding: 0; }
.sidebar a { display: block; padding: 0.25rem 0.5rem; text-decoration: none; border-radius: 4px; }
.sidebar a:hover { background: rgba(128,128,128,0.15); }
.content { flex: 1; max-width: 52rem; margin: 0 auto; padding: 2rem 2.5rem; }
pre { overflow-x: auto; padding: 1rem; background: rgba(128,128,128,0.12); border-radius: 6px; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
table { border-collapse: collapse; } th, td { border: 1px solid rgba(128,128,128,0.4); padding: 0.4rem 0.6rem; }
`.trim();

function buildNav(entries: Array<{ href: string; title: string }>): string {
  const items = entries
    .map((e) => `      <li><a href="${escapeHtml(e.href)}">${escapeHtml(e.title)}</a></li>`)
    .join('\n');
  return `<nav class="sidebar">\n    <ul>\n${items}\n    </ul>\n  </nav>`;
}

function renderPage(opts: { title: string; contentHtml: string; nav: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="layout">
  ${opts.nav}
  <main class="content">
${opts.contentHtml}
  </main>
</div>
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad: true });
</script>
</body>
</html>
`;
}

// ─── Site builder ────────────────────────────────────────────────────────────

/**
 * Convert a set of generated markdown docs into standalone, cross-linked HTML
 * pages with a shared sidebar. Pure: returns the pages, writes nothing.
 */
export function buildSite(
  docs: Array<{ filename: string; markdown: string }>,
): Array<{ filename: string; html: string }> {
  const resolved = docs.map((doc) => {
    const { title, body } = parseFrontMatter(doc.markdown);
    return {
      htmlName: doc.filename.replace(/\.md$/i, '.html'),
      title: title ?? deriveTitle(doc.filename),
      body,
    };
  });

  const nav = buildNav(resolved.map((r) => ({ href: r.htmlName, title: r.title })));

  return resolved.map((r) => ({
    filename: r.htmlName,
    html: renderPage({ title: r.title, contentHtml: rewriteMdLinks(markdownToHtml(r.body)), nav }),
  }));
}
