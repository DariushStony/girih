import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Deliberately narrow. This repo's real gate is `pnpm typecheck` under strict,
 * noUncheckedIndexedAccess and exactOptionalPropertyTypes, which already catches
 * most of what a type-aware lint preset would report. What is left worth enforcing
 * is the handful of rules the compiler cannot see.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'graphify-out/**',
      // Emitted by girih and hashed in .ds/manifest.json — see .prettierignore.
      'examples/*/packages/**',
      'examples/*/styles/**',
      'examples/*/.ds/**',
      'examples/*/demo/react/bundle.js',
      // Generated from docs/scripts/pages/*.mjs.
      'docs/*.html',
      'docs/md/**',
      'docs/data/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // The codebase uses leading-underscore names for deliberately unused bindings.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Diagnostics are the contract for user-facing problems; a bare throw that
      // reaches the user as a stack trace is a bug per CLAUDE.md. Not mechanically
      // enforceable, so this only bans the obviously-wrong form.
      'no-throw-literal': 'error',
      'prefer-const': 'error',
      'no-console': 'off', // the CLI's entire job is writing to stdout
    },
  },

  {
    // Generated-code templates embed TSX as strings and need no TS opinions.
    files: ['**/*.mjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
