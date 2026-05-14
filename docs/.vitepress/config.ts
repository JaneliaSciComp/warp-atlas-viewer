import { defineConfig } from 'vitepress';
import { allowedHosts } from '../../scripts/devEnv.mjs';

// Set DOCS_BASE at build time for GitHub Pages project sites
// (e.g. DOCS_BASE=/warp-atlas-viewer/ npm run docs:build).
// Defaults to '/' so local dev and root-deployed sites work as-is.
const base = process.env.DOCS_BASE ?? '/';

// The viewer lives one level above the docs in the combined bundle
// (see scripts/bundle.sh — viewer at $BASE/, docs at $BASE/docs/). Strip
// the trailing /docs/ to derive the viewer URL so a single DOCS_BASE
// override drives both sides.
const viewerUrl = base.replace(/docs\/?$/, '') || '/';

export default defineConfig({
  base,
  lang: 'en-US',
  title: 'WARP Atlas Viewer',
  description:
    'User documentation for the WARP Atlas Viewer — a browser-based viewer for the larval-zebrafish whole-brain transcriptomic + functional atlas.',
  cleanUrls: true,
  lastUpdated: true,

  // Dark only — matches the viewer itself, which has no light mode.
  // 'force-dark' both pins the theme and removes the appearance toggle
  // (plain 'dark' only changes the default; the switch stays).
  appearance: 'force-dark',

  // Mirror the main app's vite.config.ts so `npm run docs:dev` is
  // reachable from external hostnames. Set WARP_ALLOWED_HOSTS in
  // .env.local (gitignored) to add your own — see .env.local.example.
  vite: {
    server: {
      host: '0.0.0.0',
      allowedHosts,
    },
  },

  head: [
    ['meta', { name: 'theme-color', content: '#171717' }],
    ['meta', { name: 'color-scheme', content: 'dark' }],
  ],

  themeConfig: {
    siteTitle: 'WARP Atlas Viewer · Docs',

    // Exposed to the custom Layout so the home-page "Open viewer"
    // button can link out to the sibling viewer deployment without
    // VitePress prefixing it with `base`.
    viewerUrl,

    nav: [
      { text: 'Guide', link: '/getting-started', activeMatch: '/(getting-started|ui|filters|settings|selections|sharing)' },
      { text: 'Data', link: '/data-flow', activeMatch: '/(data-flow|preprocess)' },
      { text: 'Findings', link: '/findings' },
      { text: 'Glossary', link: '/glossary' },
      {
        text: 'Links',
        items: [
          { text: 'Viewer', link: viewerUrl },
          { text: 'Paper (bioRxiv)', link: 'https://www.biorxiv.org/content/10.64898/2026.02.07.704095v1' },
          { text: 'Source code', link: 'https://github.com/JaneliaSciComp/warp-atlas-viewer' },
          { text: 'Dataset (Figshare)', link: 'https://figshare.com/s/d1d19b105c4f74865c32' },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Quick start', link: '/getting-started' },
        ],
      },
      {
        text: 'The interface',
        items: [
          { text: 'Layout & panels', link: '/ui/panels' },
          { text: '3D viewer', link: '/ui/viewer' },
          { text: 't-SNE panel', link: '/ui/tsne' },
          { text: 'Detail panel', link: '/ui/detail' },
          { text: 'Color legend', link: '/ui/legend' },
        ],
      },
      {
        text: 'Filters',
        items: [
          { text: 'How filters combine', link: '/filters/overview' },
          { text: 'Colors', link: '/filters/colors' },
          { text: 'Transcriptomics', link: '/filters/transcriptomics' },
          { text: 'Visual Stimuli', link: '/filters/stimuli' },
          { text: 'Swim correlation', link: '/filters/swim' },
          { text: 'Anatomy', link: '/filters/anatomy' },
        ],
      },
      {
        text: 'Working with cells',
        items: [
          { text: 'Selections', link: '/selections' },
          { text: 'Sharing views', link: '/sharing' },
          { text: 'Settings', link: '/settings' },
        ],
      },
      {
        text: 'Under the hood',
        items: [
          { text: 'Data flow', link: '/data-flow' },
          { text: 'Preprocessing', link: '/preprocess' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Exploring findings', link: '/findings' },
          { text: 'Glossary', link: '/glossary' },
          { text: 'Troubleshooting', link: '/troubleshooting' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/JaneliaSciComp/warp-atlas-viewer' },
    ],

    search: {
      provider: 'local',
      options: {
        detailedView: true,
      },
    },

    outline: { level: [2, 3], label: 'On this page' },

    footer: {
      message:
        'Documentation for the WARP Atlas Viewer · <a href="https://www.biorxiv.org/content/10.64898/2026.02.07.704095v1">Marquez-Legorreta, Fleishman, Hesselink et al., bioRxiv 2026</a>',
      copyright: '© 2026 HHMI',
    },

    editLink: {
      pattern:
        'https://github.com/JaneliaSciComp/warp-atlas-viewer/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
});
