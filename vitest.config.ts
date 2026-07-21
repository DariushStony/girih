import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against source so packages don't need a build first.
    alias: {
      '@girih/core': r('packages/core/src/index.ts'),
      '@girih/tokens': r('packages/tokens/src/index.ts'),
      '@girih/generator-css': r('packages/generator-css/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
});
