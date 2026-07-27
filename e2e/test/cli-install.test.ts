import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
// Own scratch directory, removed on its own — sibling test files run in parallel.
const scratch = join(repoRoot, 'e2e/.tmp/cli-install');
const consumer = join(scratch, 'app');
const tarballs = join(scratch, 'tarballs');

const cliManifestPath = join(repoRoot, 'packages/girih/package.json');
const cliManifest = JSON.parse(readFileSync(cliManifestPath, 'utf8')) as {
  name: string;
  version: string;
  dependencies: Record<string, string>;
};

/**
 * Every package @faravahar/girih pulls in, plus the CLI and the runtime that generated
 * code imports. Derived from the CLI's own dependencies rather than listed, so adding a
 * library package cannot silently escape this test — and because directory names now
 * match package names, the name *is* the path.
 */
const PACKAGE_NAMES = [
  ...Object.keys(cliManifest.dependencies).filter((d) => d.startsWith('@faravahar/')),
  cliManifest.name,
  '@faravahar/girih-react-runtime',
];
const packageDirFor = (name: string) => join(repoRoot, 'packages', name.replace('@faravahar/', ''));

// npm/pnpm/yarn are .cmd shims on Windows, so spawning them there needs a shell —
// the same reason the CLI's own spawnSync calls do this.
const run = (cmd: string, args: string[], cwd: string) =>
  spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });

/** pnpm, never npm: only pnpm's packer rewrites `workspace:*` to a real version. */
function pack(packageDir: string): { name: string; tgz: string } {
  const before = new Set(existsSync(tarballs) ? readdirSync(tarballs) : []);
  const result = run('pnpm', ['pack', '--pack-destination', tarballs], packageDir);
  if (result.status !== 0) throw new Error(`pnpm pack failed in ${packageDir}:\n${result.stdout}\n${result.stderr}`);
  const created = readdirSync(tarballs).find((f) => f.endsWith('.tgz') && !before.has(f));
  if (!created) throw new Error(`pnpm pack produced no new tarball in ${packageDir}`);
  const { name } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as { name: string };
  return { name, tgz: join(tarballs, created) };
}

/**
 * The one thing no other test covered: installing the CLI itself the way a stranger
 * will, and running its binary from node_modules/.bin.
 *
 * consumer.test.ts packs the *generated* design system, but invokes the CLI as
 * `node packages/girih/dist/cli.js` straight out of the workspace — so a broken exports
 * map, a missing "files" entry, or an unresolvable internal pin in any of the six
 * library packages would have shipped undetected.
 */
// Every test here spawns the CLI as a real process, often several times. A CI runner
// is far slower at that than a dev machine — the eject test measured 2.5s locally and
// 5.13s on Windows, just over vitest's 5s default — so the suite gets a timeout that
// reflects what it actually does. Unit tests keep the strict default: a hang there is a
// bug, not a slow machine. Per-test timeouts below still override this.
const SUITE_TIMEOUT = 30_000;

describe('cli install: pack every package → install → run the binary', { timeout: SUITE_TIMEOUT }, () => {
  let installed = false;
  let packed: Array<{ name: string; tgz: string }> = [];

  beforeAll(async () => {
    if (!existsSync(join(repoRoot, 'packages/girih/dist/cli.js'))) {
      throw new Error('run `pnpm build` before the cli-install e2e.');
    }
    await rm(scratch, { recursive: true, force: true });
    await mkdir(tarballs, { recursive: true });
    await mkdir(consumer, { recursive: true });

    packed = PACKAGE_NAMES.map((name) => pack(packageDirFor(name)));

    // Overriding every internal pin with its tarball is what makes this installable
    // while unpublished; the pins themselves are asserted below, before the override
    // can hide them.
    await writeFile(
      join(consumer, 'package.json'),
      JSON.stringify(
        {
          name: 'girih-cli-consumer',
          private: true,
          type: 'module',
          devDependencies: Object.fromEntries(packed.map(({ name, tgz }) => [name, `file:${tgz}`])),
        },
        null,
        2,
      ),
    );

    const install = run('npm', ['install', '--no-audit', '--no-fund'], consumer);
    installed = install.status === 0;
    if (!installed) throw new Error(`npm install failed:\n${install.stdout}\n${install.stderr}`);
  }, 300_000);

  afterAll(() => rm(scratch, { recursive: true, force: true }));

  it('publishes no unresolved workspace protocol in any internal pin', () => {
    // Every library the CLI depends on got packed — derived, so a new one is covered
    // automatically rather than quietly skipped.
    expect(packed.map((p) => p.name).sort()).toEqual([...PACKAGE_NAMES].sort());

    // If pnpm's rewrite ever regressed, these packages would install only via the
    // file: overrides in beforeAll and fail for a real consumer. Read every installed
    // manifest, not just the CLI's — five of them carry internal pins.
    //
    // Read from node_modules rather than by shelling out to `tar`: the installed copy
    // is what a consumer actually resolves against, and `tar` flags differ under the
    // bsdtar that ships with Windows.
    for (const { name } of packed) {
      const installedManifest = join(consumer, 'node_modules', ...name.split('/'), 'package.json');
      expect(existsSync(installedManifest), `${name} did not install`).toBe(true);
      const published = JSON.parse(readFileSync(installedManifest, 'utf8')) as { dependencies?: Record<string, string> };
      for (const [dep, range] of Object.entries(published.dependencies ?? {})) {
        expect(range, `${dep} in the installed ${name} manifest`).not.toContain('workspace:');
      }
    }
  });

  it('exposes both bins on PATH and reports its version', () => {
    expect(installed).toBe(true);
    for (const bin of ['girih', 'ds']) {
      const result = run(join(consumer, 'node_modules/.bin', bin), ['--version'], consumer);
      expect(result.status, `${bin} --version\n${result.stderr}`).toBe(0);
      const { version } = JSON.parse(readFileSync(join(repoRoot, 'packages/girih/package.json'), 'utf8')) as { version: string };
      expect(result.stdout.trim()).toBe(version);
    }
  });

  it('loads all six library packages through their published exports maps', () => {
    // `doctor` reaches core (config), and the command surface below reaches the rest.
    // A broken "exports" or a missing "files" entry surfaces here as a resolve error.
    const result = run(join(consumer, 'node_modules/.bin/girih'), ['doctor', '--offline'], consumer);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('node');
    expect([0, 1]).toContain(result.status); // warns outside a workspace; must not crash
  });

  it('scaffolds, validates, generates and builds from the installed CLI alone', () => {
    const girih = (...args: string[]) => run(join(consumer, 'node_modules/.bin/girih'), args, consumer);

    // init rather than create: the consumer already has a package.json, and create
    // would try to install unpublished packages by name.
    expect(girih('init', '--name', '@installed/design-system').status, 'init').toBe(0);

    const check = girih('check', '--no-table');
    expect(check.stdout, `check\n${check.stderr}`).toContain('✔ no problems');

    const generate = girih('generate', 'react');
    expect(generate.status, `generate\n${generate.stderr}`).toBe(0);
    expect(existsSync(join(consumer, 'packages/design-system/src/Button.tsx'))).toBe(true);

    // The whole chain's end: tsc compiles the emitted TSX against the installed
    // runtime and react. This is what the GIRIH6002 preflight guards.
    const reactInstall = run('npm', ['install', '--no-save', '--no-audit', '--no-fund', 'react@^19', '@types/react@^19'], consumer);
    expect(reactInstall.status, `react install\n${reactInstall.stderr}`).toBe(0);

    const build = girih('build');
    expect(build.stdout + build.stderr, 'build').not.toContain('GIRIH6002');
    expect(build.status, `build\n${build.stdout}\n${build.stderr}`).toBe(0);
    expect(existsSync(join(consumer, 'packages/design-system/dist/Button.js'))).toBe(true);
    expect(existsSync(join(consumer, 'packages/design-system/dist/Button.d.ts'))).toBe(true);
  }, 300_000);
});
