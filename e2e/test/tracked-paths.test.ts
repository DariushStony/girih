import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards against a rename that exists on disk but not in git.
 *
 * macOS sets `core.ignorecase`, so `badge.json` and `Badge.json` are one path. Rename a file
 * by case only and — if the contents are unchanged — git stages nothing and `git status` is
 * clean. The working tree is right, the committed tree is wrong, and nothing local notices.
 *
 * Linux CI is case-sensitive, so a fresh clone gets the old names. That is exactly how the
 * kebab-case rename shipped a broken commit: every local check passed, and ci/packaging
 * failed on a name no longer generated. The failure was also unreproducible locally, because
 * the local working tree had never been wrong.
 *
 * Comparing the index against a case-sensitive reading of the filesystem catches it on the
 * machine that caused it. On Linux this is a tautology; on macOS it is the only thing
 * standing between a case-only rename and a red pipeline.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('tracked paths', () => {
  it("git's index agrees with the filesystem on case", () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    expect(tracked.length).toBeGreaterThan(200); // guard the guard

    const listings = new Map<string, string[]>();
    const entries = (dir: string): string[] => {
      if (!listings.has(dir)) {
        try {
          listings.set(dir, readdirSync(dir === '' ? repoRoot : `${repoRoot}/${dir}`));
        } catch {
          listings.set(dir, []);
        }
      }
      return listings.get(dir)!;
    };

    const mismatches: string[] = [];
    for (const path of tracked) {
      const slash = path.lastIndexOf('/');
      const dir = slash === -1 ? '' : path.slice(0, slash);
      const base = path.slice(slash + 1);
      const siblings = entries(dir);
      // Absent entirely is a deleted-but-still-tracked file, which git status does report;
      // only flag the case-only divergence it stays silent about.
      if (!siblings.includes(base) && siblings.some((e) => e.toLowerCase() === base.toLowerCase())) {
        const actual = siblings.find((e) => e.toLowerCase() === base.toLowerCase())!;
        mismatches.push(`git has ${path} but the filesystem has ${dir ? `${dir}/` : ''}${actual}`);
      }
    }

    expect(mismatches, 'stage the rename with `git mv` — a case-only rename is invisible to `git add -A` here').toEqual([]);
  });

  it('keeps every committed IR file kebab-case', () => {
    // Filtered here rather than by pathspec: `examples/*/.ds/ir/` matches nothing, because a
    // `*` in a git pathspec does not cross `/`. A silently-empty match would have made this
    // assertion vacuous.
    const ir = execFileSync('git', ['ls-files', 'examples'], { cwd: repoRoot, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter((p) => /^examples\/[^/]+\/\.ds\/ir\/.+\.json$/.test(p));
    expect(ir.length, 'no IR files found — the path moved and this check went vacuous').toBeGreaterThan(0);
    expect(ir.filter((p) => /\/[^/]*[A-Z]/.test(p))).toEqual([]);
  });
});
