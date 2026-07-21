import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { emittedFile, loadConfig, verifyEmittedFiles, writeEmittedFiles } from '@girih/core';

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
