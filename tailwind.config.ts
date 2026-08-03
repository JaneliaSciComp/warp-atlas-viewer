import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Backed by CSS variables so embedded mode can re-point them without
        // any component knowing it exists. The <alpha-value> placeholder is
        // what makes opacity modifiers (ring-accent/60) work — a raw
        // var(--accent) cannot take an alpha channel.
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        panel: 'rgb(var(--panel-rgb) / <alpha-value>)',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
