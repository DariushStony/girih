import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadSpecs } from '@faravahar/girih-spec';
import { acmeConfig } from '../../girih-tokens/test/fixture.js';

const dirs: string[] = [];
afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

async function workspace(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'girih-load-'));
  dirs.push(root);
  await mkdir(join(root, 'components'), { recursive: true });
  for (const [path, contents] of Object.entries(files)) await writeFile(join(root, path), contents, 'utf8');
  return root;
}

const CONTRACT = `import { defineSpec } from '@faravahar/girih-spec';
export default defineSpec({ name: 'Button', element: 'button', tokens: { base: {} } });
`;

describe('loadSpecs', () => {
  // Against the real example workspace, not a temp dir: a contract imports
  // '@faravahar/girih', which only resolves somewhere with the dependency installed.
  // The negative cases below never load a file, so a temp dir is fine for them.
  it('finds contracts under the default glob', async () => {
    const { specs, diagnostics } = await loadSpecs(acmeConfig);
    expect(specs.map((s) => s.file)).toEqual([
      'components/badge.contract.ts',
      'components/button.contract.ts',
      'components/card.contract.ts',
      'components/checkbox.contract.ts',
      'components/dialog.contract.ts',
      'components/input.contract.ts',
    ]);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  // The rename from *.spec.ts landed as a clean break, so the only thing standing between an
  // upgrading consumer and a mystery is this diagnostic: without it the catalog is simply
  // empty, and the visible error blames an extension for a component that "does not exist".
  it('reports GIRIH4023 when only legacy *.spec.ts files are present', async () => {
    const root = await workspace({ 'components/button.spec.ts': CONTRACT });
    const { specs, diagnostics } = await loadSpecs({ ...acmeConfig, root });
    expect(specs).toEqual([]);
    const legacy = diagnostics.find((d) => d.code === 'GIRIH4023');
    expect(legacy, `expected GIRIH4023, got ${diagnostics.map((d) => d.code).join(', ') || '(none)'}`).toBeDefined();
    expect(legacy!.severity).toBe('error');
    expect(legacy!.message).toContain('button.spec.ts');
    expect(legacy!.help).toBeTypeOf('string');
  });

  // A tokens-only design system is legitimate, so an empty catalog is not itself a problem.
  it('stays silent when there are no component files at all', async () => {
    const root = await workspace({});
    const { specs, diagnostics } = await loadSpecs({ ...acmeConfig, root });
    expect(specs).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  // Someone who deliberately configures a different pattern owns it; probing for a legacy
  // name they never used would be noise.
  it('does not probe for legacy names under a custom glob', async () => {
    const root = await workspace({ 'components/button.spec.ts': CONTRACT });
    const { diagnostics } = await loadSpecs({
      ...acmeConfig,
      root,
      components: { ...acmeConfig.components, specs: 'components/*.declaration.ts' },
    });
    expect(diagnostics.some((d) => d.code === 'GIRIH4023')).toBe(false);
  });
});
