import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { emittedFile, loadConfig, verifyEmittedFiles, writeEmittedFiles } from '@faravahar/girih-core';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe('loadConfig', () => {
  it('loads a valid config and applies defaults', async () => {
    const { config, diagnostics } = await loadConfig(fixture('valid'));
    expect(diagnostics).toEqual([]);
    expect(config).not.toBeNull();
    expect(config!.name).toBe('@test/design-system');
    expect(config!.tokens).toEqual({ source: ['tokens/**/*.tokens.json'], prefix: 'ds' });
    expect(config!.brands.default).toBe('main');
    expect(config!.brands.all[0]!.tokensFile).toBe(join(fixture('valid'), 'brands/main/tokens.json'));
    expect(config!.targets.css).toEqual({ output: 'packages/design-system/styles', selector: 'data-attribute' });
  });

  it('reports GIRIH1001 when no config exists', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'girih-'));
    const { config, diagnostics } = await loadConfig(empty);
    expect(config).toBeNull();
    expect(diagnostics[0]).toMatchObject({ code: 'GIRIH1001', severity: 'error' });
    await rm(empty, { recursive: true });
  });

  it('reports GIRIH1006 when brands.default is not a defined brand', async () => {
    const { config, diagnostics } = await loadConfig(fixture('bad-default'));
    expect(config).toBeNull();
    expect(diagnostics.some((d) => d.code === 'GIRIH1006')).toBe(true);
  });

  it('reports GIRIH1004 when a brand overlay file is missing', async () => {
    const { config, diagnostics } = await loadConfig(fixture('missing-brand-file'));
    expect(config).toBeNull();
    expect(diagnostics.some((d) => d.code === 'GIRIH1004')).toBe(true);
  });

  // Asserts the help line exists, not its wording — the text should stay free to improve.
  // These four carried only a code, which is the least useful moment to withhold guidance:
  // every one of them fires on a first run, before the user knows the config's shape.
  it.each([
    ['GIRIH1002', 'export default {'],
    ['GIRIH1007', 'export default 42;'],
    // Brands are supplied so only the missing name is reported: an error from
    // validateRawConfig returns before the brand overlay files are checked.
    ['GIRIH1003', "export default { brands: { default: 'base', definitions: { base: { tokens: 'b.json' } } } };"],
    ['GIRIH1005', "export default { name: '@test/ds' };"],
  ])('reports %s with a help line', async (code, source) => {
    const dir = await mkdtemp(join(tmpdir(), 'girih-help-'));
    await writeFile(join(dir, 'ds.config.ts'), source, 'utf8');
    const { diagnostics } = await loadConfig(dir);
    const found = diagnostics.find((d) => d.code === code);
    expect(found, `expected ${code} among ${diagnostics.map((d) => d.code).join(', ')}`).toBeDefined();
    expect(found!.help).toBeTypeOf('string');
    expect(found!.help).not.toHaveLength(0);
    await rm(dir, { recursive: true });
  });
});

describe('write/verifyEmittedFiles', () => {
  const dirs: string[] = [];
  afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true }))));

  it('round-trips cleanly and detects staleness (the --check gate)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'girih-emit-'));
    dirs.push(dir);
    const files = [emittedFile('styles/tokens.css', ':root {}\n'), emittedFile('styles/tokens.d.ts', 'export {};\n')];

    // Never written → everything stale.
    expect(await verifyEmittedFiles(dir, files)).toEqual(['styles/tokens.css', 'styles/tokens.d.ts']);

    await writeEmittedFiles(dir, files);
    expect(await verifyEmittedFiles(dir, files)).toEqual([]);

    // Out-of-band edit → stale again.
    await writeFile(join(dir, 'styles/tokens.css'), ':root { --tampered: 1; }\n');
    expect(await verifyEmittedFiles(dir, files)).toEqual(['styles/tokens.css']);
  });
});
