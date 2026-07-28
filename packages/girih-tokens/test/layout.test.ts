import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildTokenGraphs } from '@faravahar/girih-tokens';
import type { ResolvedConfig } from '@faravahar/girih-core';

const dirs: string[] = [];
afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

async function workspace(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'girih-layout-'));
  dirs.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), contents, 'utf8');
  }
  return root;
}

const config = (root: string, source = ['design/**/*.tokens.json']): ResolvedConfig => ({
  root,
  name: '@t/ds',
  tokens: { source, prefix: 'ds' },
  brands: { default: 'main', all: [{ name: 'main', label: 'main', tokensFile: join(root, 'design/brands/main.json') }] },
  components: { specs: 'design/components/**/*.contract.ts', ejected: [], extensions: 'design/components/**/*.ext.ts' },
  targets: {
    react: { output: 'packages/design-system' },
    css: { output: 'packages/design-system/styles', selector: 'data-attribute' },
  },
});

const GLOBAL = JSON.stringify({ color: { $type: 'color', blue: { $value: '#00f' } } });

describe('the design/ input layout', () => {
  it('infers all three tiers from the default layout', async () => {
    const root = await workspace({
      'design/tokens/global.tokens.json': GLOBAL,
      'design/tokens/semantic.tokens.json': JSON.stringify({ action: { $type: 'color', $value: '{color.blue}' } }),
      // The tier comes from the `/components/` segment, which is what lets a component's
      // tokens sit beside its contract instead of in a separate tokens/components tree.
      'design/components/button/button.tokens.json': JSON.stringify({
        button: { background: { $type: 'color', $value: '{action}' } },
      }),
      'design/brands/main.json': '{}',
    });
    const { base, diagnostics } = await buildTokenGraphs(config(root));
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const tiers = [...base.tokens.values()].map((t) => t.tier);
    expect(tiers).toContain('global');
    expect(tiers).toContain('semantic');
    expect(tiers).toContain('component');
  });

  // Without this, upgrading surfaces as a bare "no token files matched" and the user has no
  // reason to know a rename happened.
  it('explains the move when a workspace is still on the old layout', async () => {
    const root = await workspace({ 'tokens/global.tokens.json': GLOBAL, 'brands/main/tokens.json': '{}' });
    const { diagnostics } = await buildTokenGraphs(config(root));
    const empty = diagnostics.find((d) => d.code === 'GIRIH2006');
    expect(empty, 'expected GIRIH2006').toBeDefined();
    expect(empty!.help).toContain('design/');
    expect(empty!.help).toContain('ds.config.ts');
  });

  it('offers the plain hint when there is no old layout to migrate', async () => {
    const root = await workspace({ 'design/brands/main.json': '{}' });
    const { diagnostics } = await buildTokenGraphs(config(root));
    const empty = diagnostics.find((d) => d.code === 'GIRIH2006');
    expect(empty!.help).toContain('Create design/tokens/global.tokens.json');
  });

  // A custom glob means the author chose their own layout; second-guessing it would be noise.
  it('stays quiet about the layout under a custom glob', async () => {
    const root = await workspace({ 'tokens/global.tokens.json': GLOBAL, 'design/brands/main.json': '{}' });
    const { diagnostics } = await buildTokenGraphs(config(root, ['nowhere/**/*.tokens.json']));
    const empty = diagnostics.find((d) => d.code === 'GIRIH2006');
    expect(empty!.help).not.toContain('pre-0.4 layout');
  });
});
