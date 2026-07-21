import { describe, expect, it } from 'vitest';
import { applyBrandOverlay, mergeTokenFiles, resolveTokenSet } from '@girih/tokens';
import type { TokenBuildResult, TokenFileInput } from '@girih/tokens';
import { generateCss, generateTokenTypes } from '@girih/generator-css';

const options = { prefix: 'ds', defaultBrand: 'main', selector: 'data-attribute' as const };

/** Build a TokenBuildResult in memory: base files + per-brand overlay contents. */
function buildFrom(files: TokenFileInput[], overlays: Record<string, unknown>, defaultBrand = 'main'): TokenBuildResult {
  const merged = mergeTokenFiles(files);
  const graphs = new Map();
  const overrides = new Map();
  const diagnostics = [...merged.diagnostics];
  for (const [brand, contents] of Object.entries(overlays)) {
    const overlaid = applyBrandOverlay(merged.set, { file: `brands/${brand}/tokens.json`, tier: 'semantic', contents });
    diagnostics.push(...overlaid.diagnostics);
    overrides.set(brand, overlaid.overriddenPaths);
    const resolved = resolveTokenSet(brand, overlaid.set);
    diagnostics.push(...resolved.diagnostics);
    graphs.set(brand, resolved.graph);
  }
  void defaultBrand;
  return { base: merged.set, graphs, overrides, diagnostics };
}

describe('composite values in CSS output', () => {
  it('flattens shadow composites to CSS shorthand instead of [object Object]', async () => {
    const build = buildFrom(
      [
        {
          file: 'global.tokens.json',
          tier: 'global',
          contents: {
            shadow: {
              card: {
                $type: 'shadow',
                $value: { color: '#00000033', offsetX: '0px', offsetY: '2px', blur: '4px', spread: '0px' },
              },
            },
          },
        },
      ],
      { main: {} },
    );
    const { files, diagnostics } = await generateCss(build, options);
    expect(diagnostics).toEqual([]);
    const css = files.find((f) => f.path === 'tokens.css')!.contents;
    expect(css).not.toContain('[object Object]');
    expect(css).toContain('--ds-shadow-card: 0px 2px 4px 0px #00000033;');
  });

  it('fails loudly (GIRIH3002) when a composite has no CSS flattening', async () => {
    const build = buildFrom(
      [
        {
          file: 'global.tokens.json',
          tier: 'global',
          contents: { weird: { thing: { $type: 'gradient', $value: { stops: ['#000', '#fff'] } } } },
        },
      ],
      { main: {} },
    );
    const { diagnostics } = await generateCss(build, options);
    expect(diagnostics.some((d) => d.code === 'GIRIH3002' && d.severity === 'error')).toBe(true);
  });
});

describe('CSS variable name collisions', () => {
  it('errors (GIRIH3003) when two token paths map to one CSS variable', async () => {
    const build = buildFrom(
      [
        {
          file: 'global.tokens.json',
          tier: 'global',
          contents: {
            color: {
              primary: { hover: { $value: '#111', $type: 'color' } },
              'primary-hover': { $value: '#222', $type: 'color' },
            },
          },
        },
      ],
      { main: {} },
    );
    const { files, diagnostics } = await generateCss(build, options);
    expect(diagnostics.some((d) => d.code === 'GIRIH3003' && d.severity === 'error')).toBe(true);
    expect(files).toEqual([]); // refused to emit
  });
});

describe('default-brand overrides must not leak into other brands', () => {
  const files: TokenFileInput[] = [
    {
      file: 'global.tokens.json',
      tier: 'global',
      contents: {
        color: {
          blue: { $value: '#00f', $type: 'color' },
          red: { $value: '#f00', $type: 'color' },
        },
      },
    },
    {
      file: 'semantic.tokens.json',
      tier: 'semantic',
      contents: { color: { primary: { $value: '{color.blue}', $type: 'color' } } },
    },
  ];

  it('re-emits default-overridden paths in every non-default brand block', async () => {
    const build = buildFrom(files, {
      main: { color: { primary: { $value: '{color.red}' } } }, // default brand overrides!
      other: {}, // does not override anything
    });
    const { files: emitted, diagnostics } = await generateCss(build, options);
    expect(diagnostics).toEqual([]);
    const css = emitted.find((f) => f.path === 'tokens.css')!.contents;

    // :root carries the default brand's override…
    const rootBlock = css.split('[data-brand')[0]!;
    expect(rootBlock).toContain('--ds-color-primary: var(--ds-color-red);');
    // …and 'other' must reset it back to its own (base) value, despite overriding nothing itself.
    const otherBlock = css.split('[data-brand="other"]')[1];
    expect(otherBlock).toBeDefined();
    expect(otherBlock).toContain('--ds-color-primary: var(--ds-color-blue);');
  });
});

describe('selector modes and empty sets', () => {
  it('supports class selectors', async () => {
    const build = buildFrom(
      [{ file: 'global.tokens.json', tier: 'global', contents: { color: { x: { $value: '#000', $type: 'color' } } } }],
      { main: {}, alt: { color: { x: { $value: '#fff' } } } },
    );
    const { files } = await generateCss(build, { ...options, selector: 'class' });
    expect(files.find((f) => f.path === 'tokens.css')!.contents).toContain('.brand-alt {');
  });

  it('emits valid TypeScript for an empty token set', () => {
    const build = buildFrom([], { main: {} });
    const dts = generateTokenTypes(build, options).contents;
    expect(dts).toContain('export type TokenPath =\n  never;');
    expect(dts).not.toContain('tokenPaths'); // no runtime const in a .d.ts with no backing module
  });
});
