import { describe, expect, it } from 'vitest';
import { applyBrandOverlay, mergeTokenFiles } from '@faravahar/girih-tokens';

const base = () =>
  mergeTokenFiles([
    {
      file: 'tokens/global.tokens.json',
      tier: 'global',
      contents: {
        color: { $type: 'color', blue: { 500: { $value: '#00F' } }, green: { 500: { $value: '#0F0' } } },
      },
    },
    {
      file: 'tokens/semantic.tokens.json',
      tier: 'semantic',
      contents: { color: { $type: 'color', primary: { $value: '{color.blue.500}' } } },
    },
  ]).set;

describe('applyBrandOverlay', () => {
  it('overrides an existing token and reports which paths changed', () => {
    const { set, diagnostics, overriddenPaths } = applyBrandOverlay(base(), {
      file: 'brands/seller/tokens.json',
      tier: 'semantic',
      contents: { color: { primary: { $value: '{color.green.500}' } } },
    });
    expect(diagnostics).toEqual([]);
    expect(overriddenPaths).toEqual(['color.primary']);
    const token = set.tokens.get('color.primary')!;
    expect(token.value).toBe('{color.green.500}');
    expect(token.tier).toBe('semantic'); // tier comes from the base token, not the overlay
    expect(token.file).toBe('brands/seller/tokens.json');
  });

  it('rejects overlay paths that do not exist in the base set (override-only rule)', () => {
    const { diagnostics, overriddenPaths } = applyBrandOverlay(base(), {
      file: 'brands/seller/tokens.json',
      tier: 'semantic',
      contents: { color: { 'seller-special': { $value: '#BADA55' } } },
    });
    expect(overriddenPaths).toEqual([]);
    expect(diagnostics[0]).toMatchObject({ code: 'GIRIH2020', severity: 'error', path: 'color.seller-special' });
  });

  it('rejects overlays that change a token $type', () => {
    const { diagnostics } = applyBrandOverlay(base(), {
      file: 'brands/seller/tokens.json',
      tier: 'semantic',
      contents: { color: { primary: { $value: '8px', $type: 'dimension' } } },
    });
    expect(diagnostics[0]).toMatchObject({ code: 'GIRIH2021', severity: 'error', path: 'color.primary' });
  });

  it('errors on duplicate definitions across base files', () => {
    const { diagnostics } = mergeTokenFiles([
      { file: 'a.tokens.json', tier: 'global', contents: { color: { x: { $value: '#000' } } } },
      { file: 'b.tokens.json', tier: 'global', contents: { color: { x: { $value: '#FFF' } } } },
    ]);
    expect(diagnostics[0]).toMatchObject({ code: 'GIRIH2010', severity: 'error', path: 'color.x' });
  });
});
