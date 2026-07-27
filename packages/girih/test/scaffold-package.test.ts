import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { workspacePackageJson } from '../src/scaffold.js';

const cli = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
  name: string;
  version: string;
};

const written = () =>
  JSON.parse(
    workspacePackageJson({
      workspaceName: 'my-ds',
      cliPackage: cli.name,
      runtimePackage: '@faravahar/girih-react-runtime',
      version: cli.version,
    }),
  ) as { devDependencies: Record<string, string>; scripts: Record<string, string>; private: boolean };

describe('workspacePackageJson', () => {
  it('declares everything girih build needs', () => {
    // Regression: scaffolding only the CLI left `girih build` failing with four
    // TS2307s, because the emitted components import react and the runtime.
    expect(Object.keys(written().devDependencies).sort()).toEqual(
      [cli.name, '@faravahar/girih-react-runtime', '@types/react', 'react'].sort(),
    );
  });

  it('pins the girih packages to the running CLI, since internal deps publish as exact pins', () => {
    const deps = written().devDependencies;
    expect(deps[cli.name]).toBe(`^${cli.version}`);
    expect(deps['@faravahar/girih-react-runtime']).toBe(`^${cli.version}`);
  });

  it('omits react-dom — the scaffolded demo needs no renderer', () => {
    expect(written().devDependencies).not.toHaveProperty('react-dom');
  });

  it('is private, so a scaffolded workspace cannot be published by accident', () => {
    expect(written().private).toBe(true);
  });

  it('exposes the commands the scaffold tells the user to run', () => {
    expect(written().scripts).toMatchObject({ check: 'girih check', generate: 'girih generate react', build: 'girih build' });
  });
});
