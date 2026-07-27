import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { missingBuildDependencies } from '../src/build.js';

// Deliberately under os.tmpdir(), not e2e/.tmp: anything inside the repo resolves up
// into the workspace's own node_modules, where react is installed — so a test there
// can never observe a missing dependency and would pass even unfixed.
let dirs: string[] = [];

async function generatedPackage(manifest: Record<string, unknown>, installed: string[] = []): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'girih-preflight-'));
  dirs.push(dir);
  await writeFile(join(dir, 'package.json'), JSON.stringify(manifest), 'utf8');
  for (const name of installed) {
    await mkdir(join(dir, 'node_modules', name), { recursive: true });
    await writeFile(join(dir, 'node_modules', name, 'package.json'), JSON.stringify({ name, version: '1.0.0' }), 'utf8');
  }
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

describe('missingBuildDependencies', () => {
  it('reports the runtime, react and @types/react — the four TS2307s users hit', async () => {
    const dir = await generatedPackage({
      dependencies: { '@faravahar/girih-react-runtime': '^0.1.0' },
      peerDependencies: { react: '>=18' },
    });
    expect(await missingBuildDependencies(dir)).toEqual(['@faravahar/girih-react-runtime', 'react', '@types/react']);
  });

  it('is empty once everything is installed', async () => {
    const dir = await generatedPackage(
      { dependencies: { '@faravahar/girih-react-runtime': '^0.1.0' }, peerDependencies: { react: '>=18' } },
      ['@faravahar/girih-react-runtime', 'react', '@types/react'],
    );
    expect(await missingBuildDependencies(dir)).toEqual([]);
  });

  it('adds @types/react only when react is actually required', async () => {
    // A CSS-only package has no react anywhere, so demanding its types would be wrong.
    const dir = await generatedPackage({ dependencies: {} });
    expect(await missingBuildDependencies(dir)).toEqual([]);
  });

  it('derives the list from the manifest, so the headless layer is covered too', async () => {
    // A dialog contract adds @base-ui-components/react to the emitted dependencies;
    // nothing in the preflight names it, which is the point of reading the manifest.
    const dir = await generatedPackage(
      { dependencies: { '@faravahar/girih-react-runtime': '^0.1.0', '@base-ui-components/react': '1.0.0-rc.0' }, peerDependencies: { react: '>=18' } },
      ['@faravahar/girih-react-runtime', 'react', '@types/react'],
    );
    expect(await missingBuildDependencies(dir)).toEqual(['@base-ui-components/react']);
  });

  it('finds dependencies hoisted above the package, as a real install leaves them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'girih-preflight-root-'));
    dirs.push(root);
    const packageDir = join(root, 'packages', 'design-system');
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, 'package.json'), JSON.stringify({ peerDependencies: { react: '>=18' } }), 'utf8');
    for (const name of ['react', '@types/react']) {
      await mkdir(join(root, 'node_modules', name), { recursive: true });
      await writeFile(join(root, 'node_modules', name, 'package.json'), JSON.stringify({ name, version: '19.0.0' }), 'utf8');
    }
    expect(await missingBuildDependencies(packageDir)).toEqual([]);
  });
});
