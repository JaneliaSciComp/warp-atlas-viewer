// Flat-config ESLint for the viewer. The point of lint here is not
// stylistic uniformity (editor formatting handles that) but
// correctness bugs the TypeScript compiler can't see — primarily
// hook-rule violations and missing effect deps. The full
// react-hooks v7 ruleset bundles aggressive React-Compiler-aware
// checks that conflict with patterns this codebase relies on
// (mutating Three.js attributes inside an effect, mirroring props
// into refs to read inside async callbacks); we opt into only the
// two classic rules.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'docs/.vitepress/dist/**', 'docs/.vitepress/cache/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      // Prefix-with-underscore is the established convention for
      // deliberately-unused bindings.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
