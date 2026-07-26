import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildTokenGraphs } from '@girih/tokens';
import { defineSpec, specToIR } from '@girih/spec';
import type { ComponentIR } from '@girih/spec';
import { TEMPLATE_REGISTRY } from '@girih/generator-react';
import { computeSignature, diffSignatures } from '../src/semver.js';
import type { SignatureInput } from '../src/semver.js';

const acmeRoot = fileURLToPath(new URL('../../../examples/acme-ds', import.meta.url));

const acmeConfig = {
  root: acmeRoot,
  name: '@acme/design-system',
  tokens: { source: ['tokens/**/*.tokens.json'], prefix: 'ds' },
  brands: {
    default: 'marketplace',
    all: [
      { name: 'marketplace', label: 'Marketplace', tokensFile: `${acmeRoot}/brands/marketplace/tokens.json` },
      { name: 'seller', label: 'Seller', tokensFile: `${acmeRoot}/brands/seller/tokens.json` },
    ],
  },
  components: { specs: 'components/*.spec.ts', ejected: [], extensions: 'extensions/*.ext.ts' },
  targets: { react: { output: 'packages/design-system' }, css: { output: 'packages/design-system/styles', selector: 'data-attribute' as const } },
  publish: { access: 'restricted' as const },
};

const buttonSpec = () =>
  defineSpec({
    name: 'Button',
    element: 'button',
    variants: { variant: { values: ['primary', 'secondary'], default: 'primary' } },
    states: ['hover'],
    slots: { children: { required: true } },
    tokens: {
      base: { borderRadius: '{button.radius}' },
      variants: {
        variant: {
          primary: { background: '{button.primary.background}' },
          secondary: { background: '{button.secondary.background}' },
        },
      },
    },
    accessibility: { focusable: true },
  });

const templateVersions = Object.fromEntries(Object.entries(TEMPLATE_REGISTRY).map(([name, caps]) => [name, caps.version]));

async function signatureFor(irs: ComponentIR[], extra: Partial<SignatureInput> = {}) {
  const { graphs } = await buildTokenGraphs(acmeConfig);
  return computeSignature({ graphs, irs, extensions: [], templateVersions, ...extra });
}

// The seam the unit tests can't reach: does a real workspace's tokens + contracts
// produce a signature that actually notices the changes that matter?
describe('computeSignature over the acme workspace', () => {
  it('captures per-brand resolved values, so one brand diverging is visible', async () => {
    const signature = await signatureFor([specToIR(buttonSpec()).ir]);
    expect(Object.keys(signature.tokens).sort()).toEqual(['marketplace', 'seller']);
    // The seller overlay re-points color.primary; the signature must record both values.
    expect(signature.tokens.marketplace!['color.primary']).not.toBe(signature.tokens.seller!['color.primary']);
    expect(signature.components.Button!.templateVersion).toBe(TEMPLATE_REGISTRY.element!.version);
  });

  it('notices a restyle that keeps every name and every token value identical', async () => {
    const before = await signatureFor([specToIR(buttonSpec()).ir]);

    // Re-point one CSS property at a different token. No name changes, and both
    // tokens resolve to their own unchanged values — only the mapping moved.
    const restyled = buttonSpec();
    restyled.tokens!.variants!.variant!.primary = { background: '{button.danger.background}' };
    const after = await signatureFor([specToIR(restyled).ir]);

    const diff = diffSignatures(before, after);
    expect(diff.bump).toBe('patch');
    expect(diff.reasons.join()).toContain('style');
  });

  it('grades a removed variant value as breaking', async () => {
    const before = await signatureFor([specToIR(buttonSpec()).ir]);
    const reduced = buttonSpec();
    reduced.variants!.variant = { values: ['primary'], default: 'primary' };
    delete reduced.tokens!.variants!.variant!.secondary;
    const diff = diffSignatures(before, await signatureFor([specToIR(reduced).ir]));
    expect(diff.bump).toBe('major');
  });

  it('an unchanged workspace produces no bump', async () => {
    const a = await signatureFor([specToIR(buttonSpec()).ir]);
    const b = await signatureFor([specToIR(buttonSpec()).ir]);
    expect(diffSignatures(a, b)).toEqual({ bump: 'none', reasons: [] });
  });

  it('hashes ejected sources so fork edits are part of the contract', async () => {
    const irs = [specToIR(buttonSpec()).ir];
    const before = await signatureFor(irs, { ejected: { Button: 'export const Button = 1;' } });
    const after = await signatureFor(irs, { ejected: { Button: 'export const Button = 2;' } });
    expect(before.ejected!.Button).not.toBe(after.ejected!.Button);
    expect(diffSignatures(before, after).bump).toBe('patch');
  });
});
