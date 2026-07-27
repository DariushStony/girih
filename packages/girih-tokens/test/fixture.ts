import { fileURLToPath } from 'node:url';
import type { ResolvedConfig } from '@faravahar/girih-core';

const acmeRoot = fileURLToPath(new URL('../../../examples/acme-ds', import.meta.url));

/** ResolvedConfig for the examples/acme-ds workspace, used across package tests. */
export const acmeConfig: ResolvedConfig = {
  root: acmeRoot,
  name: '@acme/design-system',
  tokens: { source: ['tokens/**/*.tokens.json'], prefix: 'ds' },
  brands: {
    default: 'marketplace',
    all: [
      { name: 'marketplace', label: 'Marketplace', tokensFile: `${acmeRoot}/brands/marketplace/tokens.json` },
      { name: 'seller', label: 'Seller Platform', tokensFile: `${acmeRoot}/brands/seller/tokens.json` },
    ],
  },
  components: { specs: 'components/*.spec.ts', ejected: [], extensions: 'extensions/*.tsx' },
  targets: {
    react: { output: 'packages/design-system' },
    css: { output: 'packages/design-system/styles', selector: 'data-attribute' },
  },
  publish: { access: 'restricted' },
};
