import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { plainOutput } from './helpers.js';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const cliPath = join(repoRoot, 'packages/create-girih/dist/cli.js');
// Own scratch directory, removed on its own — vitest runs these files in parallel, so
// clearing all of e2e/.tmp would delete a sibling's live workspace.
const scratch = join(repoRoot, 'e2e/.tmp/create-girih');

/**
 * Runs the real bootstrapper. `npm_config_user_agent` is what a package manager sets when
 * it runs `<pm> create girih`, so setting it here is exactly how the invocation is
 * distinguished — there is no other signal at that moment.
 */
function create(dir: string, userAgent: string, ...args: string[]): { status: number | null; output: string } {
  const result = spawnSync('node', [cliPath, dir, ...args], {
    cwd: scratch,
    encoding: 'utf8',
    env: { ...process.env, npm_config_user_agent: userAgent },
  });
  return { status: result.status, output: plainOutput(`${result.stdout}\n${result.stderr}`) };
}

// No network and no install, so this suite is fast and offline — which is the point of the
// change it covers. It still spawns a real process per case, so it keeps a modest timeout.
describe('create-girih: scaffold only, install nothing', { timeout: 30_000 }, () => {
  beforeAll(async () => {
    if (!existsSync(cliPath)) throw new Error('run `pnpm build` before the create-girih e2e.');
    await rm(scratch, { recursive: true, force: true });
    await mkdir(scratch, { recursive: true });
  });
  afterAll(() => rm(scratch, { recursive: true, force: true }));

  it('writes a complete workspace and installs nothing', () => {
    const { status, output } = create('full', 'pnpm/11.17.0 npm/? node/v22', '--name', '@acme/ds');
    expect(status, output).toBe(0);

    // Every file girih needs to run `check` and `generate` — not just a package.json.
    for (const path of [
      'package.json',
      'ds.config.ts',
      'tokens/global.tokens.json',
      'tokens/semantic.tokens.json',
      'tokens/components/button.tokens.json',
      'brands/main/tokens.json',
      'components/button.contract.ts',
      'demo/index.html',
      '.gitignore',
    ]) {
      expect(existsSync(join(scratch, 'full', path)), `missing ${path}`).toBe(true);
    }

    // The whole point: no package manager was run on the user's behalf.
    expect(existsSync(join(scratch, 'full', 'node_modules')), 'nothing should have been installed').toBe(false);
    expect(output).toContain('nothing was installed');
  });

  it('names the invoking package manager in its next steps', () => {
    const cases: [string, string][] = [
      ['pnpm/11.17.0 npm/? node/v22', 'pnpm install'],
      ['yarn/1.22.22 npm/? node/v22', 'yarn install'],
      ['bun/1.1.0 npm/? node/v22', 'bun install'],
      ['npm/10.9.8 node/v22', 'npm install'],
    ];
    for (const [index, [userAgent, expected]] of cases.entries()) {
      const { status, output } = create(`pm-${index}`, userAgent, '--name', '@acme/ds');
      expect(status, output).toBe(0);
      expect(output, `user agent ${userAgent}`).toContain(expected);
    }
  });

  // An unset user agent means girih was not launched through a manager at all.
  it('falls back to npm when no user agent is set', () => {
    const { status, output } = create('no-ua', '', '--name', '@acme/ds');
    expect(status, output).toBe(0);
    expect(output).toContain('npm install');
  });

  it('refuses to scaffold over an existing package.json', () => {
    expect(create('full', 'npm/10.9.8 node/v22', '--name', '@acme/ds').status).toBe(1);
  });

  // The flag is now the only behaviour; a script that still passes it must not break.
  it('accepts --no-install as a no-op', () => {
    const { status } = create('legacy-flag', 'npm/10.9.8 node/v22', '--name', '@acme/ds', '--no-install');
    expect(status).toBe(0);
    expect(existsSync(join(scratch, 'legacy-flag', 'ds.config.ts'))).toBe(true);
  });
});
