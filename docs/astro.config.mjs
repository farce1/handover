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
          link: '/',
        },
        {
          label: 'User Guides',
          items: [
            { label: 'Getting started', link: '/user/getting-started/' },
            { label: 'Configuration', link: '/user/configuration/' },
            { label: 'Providers', link: '/user/providers/' },
            { label: 'MCP setup', link: '/user/mcp-setup/' },
            { label: 'Output documents', link: '/user/output-documents/' },
          ],
        },
        {
          label: 'Contributor docs',
          items: [
            { label: 'Development', link: '/contributor/development/' },
            { label: 'Architecture', link: '/contributor/architecture/' },
            { label: 'Adding providers', link: '/contributor/adding-providers/' },
            { label: 'Adding analyzers', link: '/contributor/adding-analyzers/' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Changelog', link: '/reference/changelog/' },
            { label: 'CLI commands', link: '/reference/commands/' },
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
