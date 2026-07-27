import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installedVersion, resolvePackageDir, resolvesFrom } from '../src/resolve.js';

// A real tree rather than a mock: this helper exists to mirror Node's resolution
// order, and a fake filesystem would let it drift from that without failing.
let root: string;
let nested: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'girih-resolve-'));
  nested = join(root, 'apps', 'web', 'src');
  await mkdir(nested, { recursive: true });
  await mkdir(join(root, 'node_modules', '@scope', 'far'), { recursive: true });
  await writeFile(join(root, 'node_modules', '@scope', 'far', 'package.json'), JSON.stringify({ name: '@scope/far', version: '1.2.3' }));
  await mkdir(join(root, 'apps', 'web', 'node_modules', 'near'), { recursive: true });
  await writeFile(join(root, 'apps', 'web', 'node_modules', 'near', 'package.json'), JSON.stringify({ name: 'near', version: '4.5.6' }));
});

afterAll(() => rm(root, { recursive: true, force: true }));

describe('resolvesFrom', () => {
  it('finds a package hoisted several directories up, as a monorepo install leaves it', () => {
    expect(resolvesFrom(nested, '@scope/far')).toBe(true);
  });

  it('finds the nearest node_modules first', () => {
    expect(resolvePackageDir(nested, 'near')).toBe(join(root, 'apps', 'web', 'node_modules', 'near'));
  });

  it('returns false rather than throwing for something not installed', () => {
    expect(resolvesFrom(nested, 'absent')).toBe(false);
    expect(resolvePackageDir(nested, 'absent')).toBeNull();
  });

  it('terminates at the filesystem root instead of looping', () => {
    // Regression guard: the walk ends when dirname(dir) === dir, and getting that
    // wrong is an infinite loop rather than a wrong answer.
    expect(resolvesFrom('/', 'definitely-not-installed')).toBe(false);
  });
});

describe('installedVersion', () => {
  it('reads the version from the resolved manifest', () => {
    expect(installedVersion(nested, '@scope/far')).toBe('1.2.3');
    expect(installedVersion(nested, 'near')).toBe('4.5.6');
  });

  it('is null when the package is absent', () => {
    expect(installedVersion(nested, 'absent')).toBeNull();
  });
});
