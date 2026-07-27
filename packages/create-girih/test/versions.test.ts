import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLI_VERSION_RANGE, RUNTIME_VERSION_RANGE, scaffoldDevDependencies } from '../src/versions.js';

const manifest = (path: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')) as { name: string; version: string };

const cli = manifest('../../cli/package.json');
const runtime = manifest('../../react-runtime/package.json');

// create-girih writes these ranges and then runs the install itself. If one resolves
// to nothing the scaffold dies *after* writing package.json, and a re-run refuses the
// non-empty directory — so the user is left with a half-made workspace.
describe('scaffolded dependency ranges', () => {
  it('are satisfiable by the versions actually being published', () => {
    expect(CLI_VERSION_RANGE).toBe(`^${cli.version}`);
    expect(RUNTIME_VERSION_RANGE).toBe(`^${runtime.version}`);
  });

  it('names the CLI package that owns the workspace template', () => {
    expect(cli.name).toBe('@faravahar/girih');
  });

  it('covers everything girih build needs, so the documented next step works', () => {
    // Regression: scaffolding only the CLI left `girih build` failing with four
    // TS2307s — react and the runtime are imported by the emitted components, and
    // @types/react is what the emitted TSX is compiled against.
    const deps = scaffoldDevDependencies(false);
    expect(Object.keys(deps).sort()).toEqual(['@faravahar/girih', runtime.name, '@types/react', 'react'].sort());
    expect(deps[cli.name]).toBe(CLI_VERSION_RANGE);
    expect(deps[runtime.name]).toBe(RUNTIME_VERSION_RANGE);
  });

  it('links the girih packages by workspace protocol under --workspace, but never react', () => {
    const deps = scaffoldDevDependencies(true);
    expect(deps[cli.name]).toBe('workspace:*');
    expect(deps[runtime.name]).toBe('workspace:*');
    // react is not a workspace package; a workspace: range for it would not resolve.
    expect(deps['react']).toBe(deps['@types/react']);
    expect(deps['react']).not.toContain('workspace:');
  });
});
