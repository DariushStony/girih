import { describe, expect, it } from 'vitest';
import { findReferences, mergeTokenFiles, resolveTokenSet } from '@faravahar/girih-tokens';
import type { TokenFileInput } from '@faravahar/girih-tokens';

const setFrom = (contents: TokenFileInput['contents'], tier: TokenFileInput['tier'] = 'global') =>
  mergeTokenFiles([{ file: 'tokens/test.tokens.json', tier, contents }]).set;

describe('findReferences', () => {
  it('finds whole-value, embedded, and composite references', () => {
    expect(findReferences('{color.blue.500}')).toEqual(['color.blue.500']);
    expect(findReferences('0 4px 8px {color.shadow}')).toEqual(['color.shadow']);
    expect(findReferences({ color: '{color.text}', offset: ['{space.1}', '2px'] })).toEqual(['color.text', 'space.1']);
    expect(findReferences('#FF0000')).toEqual([]);
  });
});

describe('resolveTokenSet', () => {
  it('resolves alias chains transitively', () => {
    const { graph, diagnostics } = resolveTokenSet(
      'test',
      setFrom({
        color: {
          $type: 'color',
          blue: { 500: { $value: '#00F' } },
          primary: { $value: '{color.blue.500}' },
          cta: { $value: '{color.primary}' },
        },
      }),
    );
    expect(diagnostics).toEqual([]);
    expect(graph.tokens.get('color.cta')!.resolvedValue).toBe('#00F');
    expect(graph.tokens.get('color.cta')!.references).toEqual(['color.primary']);
  });

  it('reports unknown references with a suggestion and poisons dependents silently', () => {
    const { graph, diagnostics } = resolveTokenSet(
      'test',
      setFrom({
        color: {
          $type: 'color',
          blue: { 500: { $value: '#00F' } },
          primary: { $value: '{color.blue.900}' },
          cta: { $value: '{color.primary}' },
        },
      }),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: 'GIRIH2030', severity: 'error', path: 'color.primary' });
    expect(diagnostics[0]!.help).toContain('color.blue.500');
    expect(graph.tokens.get('color.primary')!.resolvedValue).toBeUndefined();
    expect(graph.tokens.get('color.cta')!.resolvedValue).toBeUndefined();
  });

  it('reports a cycle once, with the full chain', () => {
    const { graph, diagnostics } = resolveTokenSet(
      'test',
      setFrom({
        color: {
          $type: 'color',
          a: { $value: '{color.b}' },
          b: { $value: '{color.c}' },
          c: { $value: '{color.a}' },
          fine: { $value: '#FFF' },
        },
      }),
    );
    const cycles = diagnostics.filter((d) => d.code === 'GIRIH2031');
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.message).toContain('→');
    expect(cycles[0]!.message).toMatch(/color\.[abc]/);
    expect(graph.tokens.get('color.a')!.resolvedValue).toBeUndefined();
    expect(graph.tokens.get('color.fine')!.resolvedValue).toBe('#FFF');
  });

  it('keeps non-reference values untouched, including composites and numbers', () => {
    const { graph } = resolveTokenSet(
      'test',
      setFrom({
        font: { weight: { medium: { $value: 500, $type: 'fontWeight' } } },
        shadow: { card: { $value: { blur: '4px', color: '#0002' }, $type: 'shadow' } },
      }),
    );
    expect(graph.tokens.get('font.weight.medium')!.resolvedValue).toBe(500);
    expect(graph.tokens.get('shadow.card')!.resolvedValue).toEqual({ blur: '4px', color: '#0002' });
  });
});
