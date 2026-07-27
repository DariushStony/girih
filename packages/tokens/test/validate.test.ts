import { describe, expect, it } from 'vitest';
import { mergeTokenFiles, resolveTokenSet, validateBrandParity, validateTierDirection } from '@faravahar/girih-tokens';
import type { ResolvedTokenGraph, TokenFileInput } from '@faravahar/girih-tokens';

function graphFrom(files: TokenFileInput[]): ResolvedTokenGraph {
  const { set } = mergeTokenFiles(files);
  return resolveTokenSet('test', set).graph;
}

describe('validateTierDirection', () => {
  it('errors on upward references (global → semantic)', () => {
    const graph = graphFrom([
      { file: 'global.tokens.json', tier: 'global', contents: { color: { $type: 'color', base: { $value: '{color.primary}' } } } },
      { file: 'semantic.tokens.json', tier: 'semantic', contents: { color: { $type: 'color', primary: { $value: '#00F' } } } },
    ]);
    const diagnostics = validateTierDirection(graph);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: 'GIRIH2040', severity: 'error', path: 'color.base' });
  });

  it('warns when a component token skips the semantic tier', () => {
    const graph = graphFrom([
      { file: 'global.tokens.json', tier: 'global', contents: { color: { $type: 'color', blue: { $value: '#00F' } } } },
      {
        file: 'components/button.tokens.json',
        tier: 'component',
        contents: { button: { background: { $value: '{color.blue}', $type: 'color' } } },
      },
    ]);
    const diagnostics = validateTierDirection(graph);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: 'GIRIH2041', severity: 'warning', path: 'button.background' });
  });

  it('accepts component → semantic → global chains and same-tier references', () => {
    const graph = graphFrom([
      {
        file: 'global.tokens.json',
        tier: 'global',
        contents: { color: { $type: 'color', blue: { $value: '#00F' }, indigo: { $value: '{color.blue}' } } },
      },
      { file: 'semantic.tokens.json', tier: 'semantic', contents: { color: { $type: 'color', primary: { $value: '{color.indigo}' } } } },
      {
        file: 'components/button.tokens.json',
        tier: 'component',
        contents: { button: { background: { $value: '{color.primary}', $type: 'color' } } },
      },
    ]);
    expect(validateTierDirection(graph)).toEqual([]);
  });

  it('errors when a whole-value alias changes the declared $type', () => {
    const graph = graphFrom([
      {
        file: 'global.tokens.json',
        tier: 'global',
        contents: {
          radius: { md: { $value: '8px', $type: 'dimension' } },
          color: { weird: { $value: '{radius.md}', $type: 'color' } },
        },
      },
    ]);
    const diagnostics = validateTierDirection(graph);
    expect(diagnostics.some((d) => d.code === 'GIRIH2042')).toBe(true);
  });
});

describe('validateBrandParity', () => {
  it('flags brands whose resolved path sets diverge', () => {
    const a = graphFrom([{ file: 'g.tokens.json', tier: 'global', contents: { color: { x: { $value: '#000', $type: 'color' } } } }]);
    const b = graphFrom([{ file: 'g.tokens.json', tier: 'global', contents: { color: { y: { $value: '#FFF', $type: 'color' } } } }]);
    const diagnostics = validateBrandParity(
      new Map([
        ['a', a],
        ['b', b],
      ]),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: 'GIRIH2050', severity: 'error' });
  });
});
