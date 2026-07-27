import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against source so packages don't need a build first.
    alias: {
      '@faravahar/girih-core': r('packages/girih-core/src/index.ts'),
      '@faravahar/girih-tokens': r('packages/girih-tokens/src/index.ts'),
      '@faravahar/girih-generator-css': r('packages/girih-generator-css/src/index.ts'),
      '@faravahar/girih-generator-react': r('packages/girih-generator-react/src/index.ts'),
      '@faravahar/girih-spec': r('packages/girih-spec/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'e2e/test/**/*.test.ts'],
  },
});
