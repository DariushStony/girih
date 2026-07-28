import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { emittedFile, verifyEmittedFiles, writeEmittedFiles } from '@faravahar/girih-core';

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

  it('reports a GIRIH1016 diagnostic instead of throwing when a file cannot be written', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'girih-emit-fail-'));
    dirs.push(dir);
    // A file where writeEmittedFiles wants to mkdir a directory — mkdir fails on a path
    // component that already exists as a regular file.
    await writeFile(join(dir, 'blocked'), 'not a directory', 'utf8');

    const diagnostics = await writeEmittedFiles(dir, [emittedFile('blocked/tokens.css', ':root {}\n')]);
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'GIRIH1016', severity: 'error' })]);
  });
});
