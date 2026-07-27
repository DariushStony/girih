import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLI_VERSION_RANGE } from '../src/versions.js';

const manifest = (path: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')) as { name: string; version: string };

const cli = manifest('../../cli/package.json');

// create-girih writes this range and then runs the install itself. If it resolves to
// nothing the scaffold dies *after* writing package.json, and a re-run refuses the
// non-empty directory — so the user is stuck with a half-made workspace.
describe('scaffolded CLI dependency range', () => {
  it('is satisfiable by the CLI version actually being published', () => {
    expect(CLI_VERSION_RANGE).toBe(`^${cli.version}`);
  });

  it('names the CLI package that owns the workspace template', () => {
    expect(cli.name).toBe('@faravahar/girih');
  });
});
