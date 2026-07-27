import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const cliPath = join(repoRoot, 'packages/cli/dist/cli.js');
// Own scratch directory, removed on its own. Clearing all of e2e/.tmp here would
// delete a sibling test file's live workspace — vitest runs the files in parallel.
const scratch = join(repoRoot, 'e2e/.tmp/commands');

const manifest = JSON.parse(readFileSync(join(repoRoot, 'packages/cli/package.json'), 'utf8')) as { version: string };

function girih(cwd: string, ...args: string[]): { status: number | null; output: string } {
  const result = spawnSync('node', [cliPath, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

describe('e2e: create, doctor, forks', () => {
  beforeAll(async () => {
    if (!existsSync(cliPath)) throw new Error('packages/cli/dist/cli.js missing — run `pnpm build` before the e2e tests.');
    await rm(scratch, { recursive: true, force: true });
    await mkdir(scratch, { recursive: true });
  });

  afterAll(() => rm(scratch, { recursive: true, force: true }));

  it('reports its own version', () => {
    const { status, output } = girih(scratch, '--version');
    expect(status).toBe(0);
    expect(output.trim()).toBe(manifest.version);
  });

  describe('create', () => {
    // --no-install throughout: the packages are not on the registry from a test run,
    // and the scaffold itself is what these assert.
    it('creates a new directory with a package.json and the workspace template', () => {
      const { status, output } = girih(scratch, 'create', 'fresh-ds', '--no-install');
      expect(status).toBe(0);
      expect(output).toContain('fresh-ds/package.json');
      expect(output).toContain('fresh-ds/ds.config.ts');

      const dir = join(scratch, 'fresh-ds');
      for (const file of ['package.json', 'ds.config.ts', 'components/button.spec.ts', 'demo/index.html', '.gitignore']) {
        expect(existsSync(join(dir, file)), file).toBe(true);
      }

      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        name: string;
        private: boolean;
        devDependencies: Record<string, string>;
      };
      expect(pkg.name).toBe('fresh-ds');
      expect(pkg.private).toBe(true);
      // The whole point of the B5 fix: everything `girih build` needs is declared.
      expect(Object.keys(pkg.devDependencies).sort()).toEqual(
        ['@faravahar/girih', '@faravahar/girih-react-runtime', '@types/react', 'react'].sort(),
      );
    });

    it('derives the published package name from the directory unless told otherwise', () => {
      girih(scratch, 'create', 'derived-ds', '--no-install');
      const config = readFileSync(join(scratch, 'derived-ds/ds.config.ts'), 'utf8');
      expect(config).toContain("name: '@derived-ds/design-system'");

      girih(scratch, 'create', 'named-ds', '--name', '@acme/ds', '--no-install');
      expect(readFileSync(join(scratch, 'named-ds/ds.config.ts'), 'utf8')).toContain("name: '@acme/ds'");
    });

    it('refuses to scaffold over an existing package.json', () => {
      const { status, output } = girih(scratch, 'create', 'fresh-ds', '--no-install');
      expect(status).toBe(1);
      expect(output).toContain('already has a package.json');
    });

    it('rejects an invalid brand name before writing anything', () => {
      const { status, output } = girih(scratch, 'create', 'bad-brand-ds', '--brand', 'My Brand', '--no-install');
      expect(status).toBe(1);
      expect(output).toContain('kebab-case');
      expect(existsSync(join(scratch, 'bad-brand-ds/ds.config.ts'))).toBe(false);
    });
  });

  describe('doctor', () => {
    it('warns but does not fail outside a workspace, so a global install can be checked', () => {
      const { status, output } = girih(scratch, 'doctor', '--offline');
      expect(status).toBe(0);
      expect(output).toContain('no ds.config.ts here');
      expect(output).toContain('nothing blocking');
    });

    it('reports the node floor and identifies the package manager', () => {
      const { output } = girih(scratch, 'doctor', '--offline');
      expect(output).toMatch(/node\s+v\d+\.\d+\.\d+ \(>=22 required\)/);
      // Under a test run npm_config_user_agent is set, so that path wins; the
      // lockfile walk is the fallback and is covered by resolve.test.ts.
      expect(output).toMatch(/package manager\s+pnpm/);
    });

    it('reports build prerequisites once something has been generated', () => {
      const dir = join(scratch, 'fresh-ds');
      expect(girih(dir, 'generate', 'react').status).toBe(0);
      const { output } = girih(dir, 'doctor', '--offline');
      expect(output).toContain('build prerequisites');
      // Not asserting the *missing* case here: e2e/.tmp resolves up into the repo's
      // own node_modules, so react can never actually be absent from this location.
      // That path is unit-tested in packages/cli/test/build-preflight.test.ts.
    });

    it('skips the registry check when asked, and never blocks on it', () => {
      const { status, output } = girih(scratch, 'doctor', '--offline');
      expect(status).toBe(0);
      expect(output).not.toContain('updates');
    });
  });

  describe('forks', () => {
    it('is the command that reports fork drift, and reports none for a clean workspace', () => {
      girih(scratch, 'create', 'forks-ds', '--no-install');
      const { status, output } = girih(join(scratch, 'forks-ds'), 'forks');
      expect(status).toBe(0);
      expect(output).toContain('No ejected components');
    });

    it('no longer answers to `update`, which now upgrades packages instead', () => {
      const { output } = girih(join(scratch, 'forks-ds'), 'update', '--check');
      // Whatever the registry does, this must not be the fork-drift report.
      expect(output).not.toContain('No ejected components');
    });
  });
});
