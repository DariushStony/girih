import { describe, expect, it } from 'vitest';
import { buildTokenGraphs, inferTier } from '@faravahar/girih-tokens';
import { acmeConfig } from './fixture.js';

describe('buildTokenGraphs on the acme-ds fixture', () => {
  it('builds a clean two-brand workspace with per-brand resolution', async () => {
    const build = await buildTokenGraphs(acmeConfig);

    expect(build.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect([...build.graphs.keys()].sort()).toEqual(['marketplace', 'seller']);
    expect(build.overrides.get('marketplace')).toEqual([]);
    expect(build.overrides.get('seller')).toEqual(expect.arrayContaining(['color.primary', 'radius.md']));

    // Same token, different brand, different resolved value.
    const marketplace = build.graphs.get('marketplace')!;
    const seller = build.graphs.get('seller')!;
    expect(marketplace.tokens.get('color.primary')!.resolvedValue).toBe('#2563EB'); // blue.600
    expect(seller.tokens.get('color.primary')!.resolvedValue).toBe('#16A34A'); // green.600

    // The override cascades through the semantic tier into component tokens.
    expect(marketplace.tokens.get('button.primary.background')!.resolvedValue).toBe('#2563EB');
    expect(seller.tokens.get('button.primary.background')!.resolvedValue).toBe('#16A34A');
    expect(seller.tokens.get('button.radius')!.resolvedValue).toBe('2px'); // radius.md override → radius.control → button.radius
  });

  it('is deterministic: two runs produce identical graphs', async () => {
    const [first, second] = await Promise.all([buildTokenGraphs(acmeConfig), buildTokenGraphs(acmeConfig)]);
    const snapshot = (build: Awaited<ReturnType<typeof buildTokenGraphs>>) =>
      JSON.stringify([...build.graphs.get('seller')!.tokens.entries()]);
    expect(snapshot(first)).toBe(snapshot(second));
  });
});

describe('inferTier', () => {
  it('maps filenames and directories to tiers', () => {
    expect(inferTier('tokens/global.tokens.json')).toEqual({ tier: 'global', inferred: true });
    expect(inferTier('tokens/semantic.tokens.json')).toEqual({ tier: 'semantic', inferred: true });
    expect(inferTier('tokens/components/button.tokens.json')).toEqual({ tier: 'component', inferred: true });
    expect(inferTier('tokens/misc.tokens.json')).toEqual({ tier: 'semantic', inferred: false });
  });
});
