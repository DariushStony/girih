import { describe, expect, it } from 'vitest';
import { buildTokenGraphs } from '@faravahar/girih-tokens';
import { cssVarName, generateCss } from '@faravahar/girih-generator-css';
import { acmeConfig } from '../../girih-tokens/test/fixture.js';

const options = { prefix: 'ds', defaultBrand: 'marketplace', selector: 'data-attribute' as const };

describe('generateCss on the acme-ds fixture', () => {
  it('emits :root for the default brand with var() references preserved', async () => {
    const build = await buildTokenGraphs(acmeConfig);
    const { files, diagnostics } = await generateCss(build, options);
    expect(diagnostics).toEqual([]);

    const css = files.find((f) => f.path === 'tokens.css')!.contents;
    expect(css).toContain(':root {');
    expect(css).toContain('--ds-color-blue-600: #2563eb;'); // color/css transform normalizes hex to lowercase
    // outputReferences: semantic + component tokens reference upstream custom properties
    expect(css).toContain('--ds-color-primary: var(--ds-color-blue-600);');
    expect(css).toContain('--ds-button-primary-background: var(--ds-color-primary);');
  });

  it('emits a seller block with the overrides plus their dependent closure', async () => {
    const build = await buildTokenGraphs(acmeConfig);
    const { files } = await generateCss(build, options);
    const css = files.find((f) => f.path === 'tokens.css')!.contents;

    const sellerBlock = css.split('[data-brand="seller"]')[1]!;
    expect(sellerBlock).toContain('--ds-color-primary');
    expect(sellerBlock).toContain('--ds-radius-md');
    // Dependents must be re-declared (as references) so a NESTED [data-brand] scope
    // recomputes them — custom properties resolve where they are declared.
    expect(sellerBlock).toContain('--ds-button-primary-background: var(--ds-color-primary);');
    expect(sellerBlock).toContain('--ds-radius-control: var(--ds-radius-md);');
    expect(sellerBlock).toContain('--ds-button-radius: var(--ds-radius-control);');
    // Unrelated tokens stay out of the block.
    expect(sellerBlock).not.toContain('--ds-color-blue-600');
    expect(sellerBlock).not.toContain('--ds-color-text:');

    // The default brand also gets a scoped re-entry block so nesting a provider
    // back to it inside a seller scope resets seller's overrides.
    const marketplaceBlock = css.split('[data-brand="marketplace"]')[1]!.split('[data-brand="seller"]')[0]!;
    expect(marketplaceBlock).toContain('--ds-color-primary: var(--ds-color-blue-600);');
    expect(marketplaceBlock).toContain('--ds-radius-md: 8px;');
    expect(marketplaceBlock).not.toContain('--ds-color-text:');
  });

  it('emits a TokenPath union that matches the CSS variable names', async () => {
    const build = await buildTokenGraphs(acmeConfig);
    const { files } = await generateCss(build, options);
    const dts = files.find((f) => f.path === 'tokens.d.ts')!.contents;

    expect(dts).toContain("| 'color.primary'");
    expect(dts).toContain("| 'button.primary.background'");
    expect(dts).toContain(`| '${cssVarName('ds', 'button.primary.background')}'`);
    expect(cssVarName('ds', 'button.primary.background')).toBe('--ds-button-primary-background');
  });

  it('is byte-deterministic across runs', async () => {
    const [a, b] = await Promise.all([
      buildTokenGraphs(acmeConfig).then((build) => generateCss(build, options)),
      buildTokenGraphs(acmeConfig).then((build) => generateCss(build, options)),
    ]);
    expect(a.files.map((f) => f.hash)).toEqual(b.files.map((f) => f.hash));
  });
});
