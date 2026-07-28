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
  // Both globs match what the example actually contains, so a test that starts calling
  // loadSpecs or loadExtensions with this config gets the real files. `extensions/*.tsx`
  // matched nothing here and no test exercised it — which is exactly how a future
  // loadExtensions test would have passed on an empty list without anyone noticing.
  components: { specs: 'components/*.contract.ts', ejected: [], extensions: 'extensions/*.ext.ts' },
  targets: {
    react: { output: 'packages/design-system' },
    css: { output: 'packages/design-system/styles', selector: 'data-attribute' },
  },
  publish: { access: 'restricted' },
};
