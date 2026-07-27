import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * The published surface of every package, snapshotted.
 *
 * Removing or renaming an export is a major-version break for consumers, and nothing
 * else in the suite notices: unit tests import what they need by name, so deleting an
 * unused-but-public export passes everything. This is the gate that makes that
 * deliberate — an intentional removal updates the snapshot in the same commit, which
 * puts the decision in the diff where a reviewer sees it.
 *
 * Runs against src/index.ts rather than the built dist so it needs no build step. The
 * cli-install e2e is what proves dist actually matches.
 */

/** Names exported by an index module, read from source rather than by importing it. */
function exportedNames(indexPath: string): string[] {
  const source = readFileSync(indexPath, 'utf8');
  const names = new Set<string>();
  // The index files are pure re-export barrels — `export { a, b } from './x.js'` and
  // `export type { T } from './x.js'` — so a parse is unnecessary and would drag in a
  // dependency to do it.
  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of match[1]!.split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) names.add(name);
    }
  }
  for (const match of source.matchAll(/export\s+(?:declare\s+)?(?:const|function|class|interface|type|enum)\s+(\w+)/g)) {
    names.add(match[1]!);
  }
  return [...names].sort();
}

const publishable = readdirSync(join(repoRoot, 'packages'))
  .map((dir) => ({ dir, manifest: JSON.parse(readFileSync(join(repoRoot, 'packages', dir, 'package.json'), 'utf8')) }))
  .filter(({ manifest }) => !manifest.private && manifest.exports)
  .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));

describe('published API surface', () => {
  it('has no emitted declarations committed under src/', () => {
    // Regression guard. A tsconfig with rootDir pointing above the package makes tsc
    // write .d.ts next to the sources before it errors, and those files are easy to
    // commit without noticing — five of them were. They are harmless at runtime (TS
    // prefers the .ts sibling) which is exactly why nothing else would catch it.
    const stray = publishable.flatMap(({ dir }) => {
      const srcDir = join(repoRoot, 'packages', dir, 'src');
      return readdirSync(srcDir, { recursive: true })
        .map(String)
        .filter((f) => f.endsWith('.d.ts'))
        .map((f) => `packages/${dir}/src/${f}`);
    });
    expect(stray, 'emitted declarations belong in dist/, not src/').toEqual([]);
  });

  it('covers every package that has an exports map', () => {
    // If a package stops being covered, this snapshot silently stops protecting it.
    expect(publishable.map((p) => p.manifest.name)).toMatchInlineSnapshot(`
      [
        "@faravahar/girih",
        "@faravahar/girih-core",
        "@faravahar/girih-generator-css",
        "@faravahar/girih-generator-react",
        "@faravahar/girih-react-runtime",
        "@faravahar/girih-spec",
        "@faravahar/girih-tokens",
      ]
    `);
  });

  for (const { dir, manifest } of publishable) {
    it(`${manifest.name} exports a stable set of names`, () => {
      const index = readdirSync(join(repoRoot, 'packages', dir, 'src')).find((f) => /^index\.tsx?$/.test(f));
      expect(index, `${dir} has no src/index.ts`).toBeDefined();
      const names = exportedNames(join(repoRoot, 'packages', dir, 'src', index!));
      expect(names.length, `${manifest.name} exports nothing — the barrel is probably broken`).toBeGreaterThan(0);
      // Snapshot per package, so a removal names the package that broke.
      expect(names).toMatchSnapshot();
    });
  }
});
