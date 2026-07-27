import { describe, expect, it } from 'vitest';
import { mergeTokenFiles, resolveTokenSet } from '@faravahar/girih-tokens';

describe('composite token values (DTCG shadow/typography/fontFamily)', () => {
  it('resolves references inside object values', () => {
    const { set } = mergeTokenFiles([
      {
        file: 'global.tokens.json',
        tier: 'global',
        contents: {
          color: { shadow: { $value: '#00000033', $type: 'color' } },
          shadow: {
            card: {
              $type: 'shadow',
              $value: { color: '{color.shadow}', offsetX: '0px', offsetY: '2px', blur: '4px', spread: '0px' },
            },
          },
        },
      },
    ]);
    const { graph, diagnostics } = resolveTokenSet('test', set);
    expect(diagnostics).toEqual([]);
    expect(graph.tokens.get('shadow.card')!.resolvedValue).toEqual({
      color: '#00000033',
      offsetX: '0px',
      offsetY: '2px',
      blur: '4px',
      spread: '0px',
    });
  });

  it('resolves references inside array values (fontFamily stacks)', () => {
    const { set } = mergeTokenFiles([
      {
        file: 'global.tokens.json',
        tier: 'global',
        contents: {
          font: {
            base: { $value: 'Inter', $type: 'fontFamily' },
            stack: { $value: ['{font.base}', 'system-ui', 'sans-serif'], $type: 'fontFamily' },
          },
        },
      },
    ]);
    const { graph, diagnostics } = resolveTokenSet('test', set);
    expect(diagnostics).toEqual([]);
    expect(graph.tokens.get('font.stack')!.resolvedValue).toEqual(['Inter', 'system-ui', 'sans-serif']);
  });

  it('reports a duplicated unknown reference only once', () => {
    const { set } = mergeTokenFiles([
      {
        file: 'global.tokens.json',
        tier: 'global',
        contents: { gradient: { hero: { $value: 'linear-gradient({missing}, {missing})', $type: 'color' } } },
      },
    ]);
    const { diagnostics } = resolveTokenSet('test', set);
    expect(diagnostics.filter((d) => d.code === 'GIRIH2030')).toHaveLength(1);
  });
});

describe('prefix collisions', () => {
  it('rejects a token nested under another token', () => {
    const { diagnostics } = mergeTokenFiles([
      { file: 'a.tokens.json', tier: 'global', contents: { color: { accent: { $value: '#f00', $type: 'color' } } } },
      { file: 'b.tokens.json', tier: 'global', contents: { color: { accent: { strong: { $value: '#900', $type: 'color' } } } } },
    ]);
    expect(diagnostics.some((d) => d.code === 'GIRIH2011')).toBe(true);
  });

  it('rejects a token whose path is an existing group', () => {
    const { diagnostics } = mergeTokenFiles([
      { file: 'a.tokens.json', tier: 'global', contents: { color: { accent: { strong: { $value: '#900', $type: 'color' } } } } },
      { file: 'b.tokens.json', tier: 'global', contents: { color: { accent: { $value: '#f00', $type: 'color' } } } },
    ]);
    expect(diagnostics.some((d) => d.code === 'GIRIH2011')).toBe(true);
  });
});

describe('parse guards', () => {
  it('errors on non-$ children inside a token node', async () => {
    const { parseTokenFile } = await import('@faravahar/girih-tokens');
    const { diagnostics } = parseTokenFile({
      file: 't.tokens.json',
      tier: 'global',
      contents: { color: { primary: { $value: '#111', $type: 'color', hover: { $value: '#222' } } } },
    });
    expect(diagnostics.some((d) => d.code === 'GIRIH2009')).toBe(true);
  });

  it('warns on unknown $-prefixed keys instead of silently dropping them', async () => {
    const { parseTokenFile } = await import('@faravahar/girih-tokens');
    const { diagnostics } = parseTokenFile({
      file: 't.tokens.json',
      tier: 'global',
      contents: { $mystery: { primary: { $value: '#111', $type: 'color' } } },
    });
    expect(diagnostics.some((d) => d.code === 'GIRIH2008' && d.severity === 'warning')).toBe(true);
  });

  it('warns on names that do not translate cleanly to CSS variables', async () => {
    const { parseTokenFile } = await import('@faravahar/girih-tokens');
    const { diagnostics } = parseTokenFile({
      file: 't.tokens.json',
      tier: 'global',
      contents: { color: { 'brand blue': { $value: '#111', $type: 'color' } } },
    });
    expect(diagnostics.some((d) => d.code === 'GIRIH2007' && d.severity === 'warning')).toBe(true);
  });
});
