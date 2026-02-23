import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

const basePath = '/handover/';

export default defineConfig({
  site: 'https://farce1.github.io',
  base: basePath,
  srcDir: './docs/src',
  outDir: 'docs/dist',
  integrations: [
    starlight({
      title: 'handover',
      tagline: 'Generate comprehensive codebase documentation for any project',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/farce1/handover',
        },
      ],
      sidebar: [
        {
          label: 'Home',
          link: '/handover/',
        },
        {
          label: 'User Guides',
          items: [
            { label: 'Getting started', link: '/handover/user/getting-started/' },
            { label: 'Configuration', link: '/handover/user/configuration/' },
            { label: 'Providers', link: '/handover/user/providers/' },
            { label: 'MCP setup', link: '/handover/user/mcp-setup/' },
            { label: 'Output documents', link: '/handover/user/output-documents/' },
          ],
        },
        {
          label: 'Contributor docs',
          items: [
            { label: 'Development', link: '/handover/contributor/development/' },
            { label: 'Architecture', link: '/handover/contributor/architecture/' },
            { label: 'Adding providers', link: '/handover/contributor/adding-providers/' },
            { label: 'Adding analyzers', link: '/handover/contributor/adding-analyzers/' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Changelog', link: '/handover/reference/changelog/' },
            { label: 'CLI commands', link: '/handover/reference/commands/' },
          ],
        },
      ],
      customCss: ['./docs/src/styles/custom.css'],
      editLink: {
        baseUrl: 'https://github.com/farce1/handover/edit/main/docs/src/content',
      },
    }),
  ],
});
