import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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
 * Runs the real bootstrapper with `--no-install`.
 *
 * The install path is deliberately untested here: it reaches the registry, and nothing in
 * this suite may depend on the network being up. What actually needs proving is that the
 * scaffold is complete and that the manifest declares girih — `cli-install.test.ts` already
 * covers packing and installing for real.
 *
 * `npm_config_user_agent` is what a package manager sets when it runs `<pm> create girih`,
 * so setting it here is exactly how the invocation is distinguished; there is no other
 * signal at that moment.
 */
function create(dir: string, userAgent: string, ...args: string[]): { status: number | null; output: string } {
  const result = spawnSync('node', [cliPath, dir, '--no-install', ...args], {
    cwd: scratch,
    encoding: 'utf8',
    env: { ...process.env, npm_config_user_agent: userAgent },
  });
  return { status: result.status, output: plainOutput(`${result.stdout}\n${result.stderr}`) };
}

const PNPM = 'pnpm/11.17.0 npm/? node/v22';

describe('create-girih', { timeout: 30_000 }, () => {
  beforeAll(async () => {
    if (!existsSync(cliPath)) throw new Error('run `pnpm build` before the create-girih e2e.');
    await rm(scratch, { recursive: true, force: true });
    await mkdir(scratch, { recursive: true });
  });
  afterAll(() => rm(scratch, { recursive: true, force: true }));

  it('writes a complete workspace under design/', () => {
    const { status, output } = create('full', PNPM, '--name', '@acme/ds');
    expect(status, output).toBe(0);

    // Everything girih needs to run check and generate — and every component's contract, tokens
    // and extension live together, which is the point of the layout.
    for (const path of [
      'package.json',
      'ds.config.ts',
      'design/tokens/global.tokens.json',
      'design/tokens/semantic.tokens.json',
      'design/brands/main.json',
      'design/components/button/button.contract.ts',
      'design/components/button/button.tokens.json',
      'demo/index.html',
      '.gitignore',
    ]) {
      expect(existsSync(join(scratch, 'full', path)), `missing ${path}`).toBe(true);
    }
  });

  // The scripts call `girih`, so the manifest has to bring it — otherwise `run generate`
  // fails on a missing binary the way a create-next-app project would with no `next`.
  it('declares girih so the generated scripts can run once installed', () => {
    const manifest = JSON.parse(readFileSync(join(scratch, 'full/package.json'), 'utf8')) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(Object.values(manifest.scripts).join(' ')).toContain('girih');
    expect(manifest.devDependencies).toHaveProperty('@faravahar/girih');
  });

  it('names the invoking package manager in its next steps', () => {
    const cases: [string, string][] = [
      [PNPM, 'pnpm install'],
      ['yarn/1.22.22 npm/? node/v22', 'yarn install'],
      ['bun/1.1.0 npm/? node/v22', 'bun install'],
      ['npm/10.9.8 node/v22', 'npm install'],
      // Unset means girih was not launched through a manager at all.
      ['', 'npm install'],
    ];
    for (const [index, [userAgent, expected]] of cases.entries()) {
      const { status, output } = create(`pm-${index}`, userAgent, '--name', '@acme/ds');
      expect(status, output).toBe(0);
      expect(output, `user agent '${userAgent}'`).toContain(expected);
    }
  });

  it('refuses to scaffold over an existing package.json', () => {
    expect(create('full', PNPM, '--name', '@acme/ds').status).toBe(1);
  });
});
