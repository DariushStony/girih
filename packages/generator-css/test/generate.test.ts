import { describe, expect, it } from 'vitest';
import { buildTokenGraphs } from '@girih/tokens';
import { cssVarName, generateCss } from '@girih/generator-css';
import { acmeConfig } from '../../tokens/test/fixture.js';

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

  it('emits a seller block containing only overridden tokens', async () => {
    const build = await buildTokenGraphs(acmeConfig);
    const { files } = await generateCss(build, options);
    const css = files.find((f) => f.path === 'tokens.css')!.contents;

    const sellerBlock = css.split('[data-brand="seller"]')[1]!;
    expect(sellerBlock).toContain('--ds-color-primary');
    expect(sellerBlock).toContain('--ds-radius-md');
    // Not overridden — must NOT be re-emitted in the brand block:
    expect(sellerBlock).not.toContain('--ds-button-primary-background:');
    expect(sellerBlock).not.toContain('--ds-color-blue-600');

    // The default (empty-overlay) brand gets no block of its own beyond :root.
    expect(css).not.toContain('[data-brand="marketplace"]');
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
