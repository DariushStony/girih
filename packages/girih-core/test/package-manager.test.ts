import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { addDevCommand, addGlobalCommand, detectPackageManager } from '@faravahar/girih-core';
import type { PackageManagerName } from '@faravahar/girih-core';

const dirs: string[] = [];
afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

async function workspace(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'girih-pm-'));
  dirs.push(root);
  for (const [name, contents] of Object.entries(files)) await writeFile(join(root, name), contents, 'utf8');
  return root;
}

describe('detectPackageManager', () => {
  it.each([
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['package-lock.json', 'npm'],
  ] as const)('reads %s as %s', async (lockfile, expected) => {
    expect(detectPackageManager(await workspace({ [lockfile]: '' }))).toBe(expected);
  });

  it('falls back to the packageManager field', async () => {
    const root = await workspace({ 'package.json': JSON.stringify({ packageManager: 'yarn@4.1.0' }) });
    expect(detectPackageManager(root)).toBe('yarn');
  });

  // The lockfile describes the workspace; packageManager only describes intent, and the two
  // disagree in a repo that switched managers without removing the old lockfile.
  it('prefers the lockfile over the packageManager field', async () => {
    const root = await workspace({
      'pnpm-lock.yaml': '',
      'package.json': JSON.stringify({ packageManager: 'npm@10.0.0' }),
    });
    expect(detectPackageManager(root)).toBe('pnpm');
  });

  it('ignores an unparseable package.json rather than throwing', async () => {
    // This runs inside diagnostics, where an exception replaces a useful message with a
    // stack trace — the exact failure mode the project forbids.
    const root = await workspace({ 'package.json': '{ not json' });
    vi.stubEnv('npm_config_user_agent', '');
    expect(detectPackageManager(root)).toBe('npm');
    vi.unstubAllEnvs();
  });

  // The user agent is the last signal before the default, and these tests run under pnpm —
  // so it has to be cleared to reach the default at all. Asserting both halves separately
  // keeps the result from depending on which manager happened to launch vitest.
  it('uses the user agent when the workspace says nothing', async () => {
    const root = await workspace({});
    vi.stubEnv('npm_config_user_agent', 'yarn/1.22.22 npm/? node/v22');
    expect(detectPackageManager(root)).toBe('yarn');
    vi.unstubAllEnvs();
  });

  it('defaults to npm when nothing at all identifies a manager', async () => {
    const root = await workspace({});
    vi.stubEnv('npm_config_user_agent', '');
    expect(detectPackageManager(root)).toBe('npm');
    vi.unstubAllEnvs();
  });

  it('lets the lockfile win over the user agent', async () => {
    const root = await workspace({ 'package-lock.json': '' });
    vi.stubEnv('npm_config_user_agent', 'pnpm/11.17.0 npm/? node/v22');
    expect(detectPackageManager(root)).toBe('npm');
    vi.unstubAllEnvs();
  });
});

describe('command phrasing', () => {
  // The verb differs, not just the binary: naming the right manager with npm's subcommand
  // still produces a command that does not run.
  it.each([
    ['npm', 'npm install -D a b'],
    ['pnpm', 'pnpm add -D a b'],
    ['yarn', 'yarn add -D a b'],
    ['bun', 'bun add -d a b'],
  ] as const)('%s adds dev dependencies as `%s`', (manager, expected) => {
    expect(addDevCommand(manager as PackageManagerName, ['a', 'b'])).toBe(expected);
  });

  it.each([
    ['npm', 'npm install -g girih'],
    ['pnpm', 'pnpm add -g girih'],
    ['yarn', 'yarn global add girih'],
    ['bun', 'bun add -g girih'],
  ] as const)('%s installs globally as `%s`', (manager, expected) => {
    expect(addGlobalCommand(manager as PackageManagerName, 'girih')).toBe(expected);
  });
});
