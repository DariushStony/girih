import { describe, expect, it } from 'vitest';
import { applyBump as girihApplyBump } from '../../packages/girih/src/semver.js';
// @ts-expect-error — plain JS release tooling, deliberately not typed.
import { BUMP_BY_TYPE, applyBump, parseCommit, renderNotes, strongest } from '../../scripts/release-prepare.mjs';

/**
 * The release script decides girih's own version. Nothing else checks it, and getting it
 * wrong publishes a permanent number — so the rules are pinned here.
 */

describe('parseCommit', () => {
  it('reads type, scope and description', () => {
    expect(parseCommit('feat(girih-cli): add doctor')).toMatchObject({
      type: 'feat',
      scope: 'girih-cli',
      description: 'add doctor',
      breaking: false,
      bump: 'minor',
    });
  });

  it('treats a scopeless subject as scopeless rather than failing', () => {
    expect(parseCommit('fix: stop the thing')).toMatchObject({ scope: null, bump: 'patch' });
  });

  it('returns null for a non-conventional subject', () => {
    // The repo has one of these in history — git's own `Revert "…"` subject.
    expect(parseCommit('Revert "self-enable Pages" — enablement cannot use GITHUB_TOKEN')).toBeNull();
    expect(parseCommit('M6: packaging and publish')).toBeNull();
  });

  it('lets `!` outrank the type', () => {
    // `refactor` alone releases nothing, but a breaking refactor is a major — which is
    // exactly the directory rename in this repo's history.
    expect(parseCommit('refactor: move a file')?.bump).toBe('none');
    expect(parseCommit('refactor!: rename package directories')?.bump).toBe('major');
  });

  it('reads a BREAKING CHANGE footer as breaking even without `!`', () => {
    expect(parseCommit('fix(girih-tokens): reject upward refs', 'BREAKING CHANGE: overlays no longer add paths')?.bump).toBe('major');
  });
});

describe('BUMP_BY_TYPE', () => {
  it('releases only for types that change what a consumer gets', () => {
    expect(BUMP_BY_TYPE).toEqual({
      feat: 'minor',
      fix: 'patch',
      perf: 'patch',
      revert: 'patch',
      // `build` ships: the TypeScript 6 upgrade changed the published dependency tree.
      build: 'patch',
      docs: 'none',
      chore: 'none',
      test: 'none',
      ci: 'none',
      style: 'none',
      refactor: 'none',
    });
  });

  it('rejects an unrecognised type outright rather than treating it as releasable', () => {
    // Not merely bump: 'none' — an unknown type is not a conventional commit at all, so
    // it stays out of the release notes too.
    expect(parseCommit('wip: something')).toBeNull();
  });
});

describe('strongest', () => {
  it('takes the highest bump present', () => {
    expect(strongest(['none', 'patch', 'minor'])).toBe('minor');
    expect(strongest(['patch', 'major', 'minor'])).toBe('major');
    expect(strongest(['none', 'none'])).toBe('none');
    expect(strongest([])).toBe('none');
  });
});

describe('applyBump', () => {
  // The whole reason this test exists: the script reimplements girih's rule because it is
  // plain JS and semver.ts is TypeScript. If the two ever disagree, girih would tell a
  // consumer one thing and version itself by another.
  it('agrees with packages/girih/src/semver.ts on every case', () => {
    const versions = ['0.0.0', '0.1.1', '0.9.9', '1.0.0', '1.2.3', '2.0.0'];
    const bumps = ['none', 'patch', 'minor', 'major'] as const;
    for (const version of versions) {
      for (const bump of bumps) {
        expect(applyBump(version, bump), `${version} + ${bump}`).toBe(girihApplyBump(version, bump));
      }
    }
  });

  it('follows the pre-1.0 convention below 1.0', () => {
    // No stable major exists yet, so breaking moves the minor and a feature moves the patch.
    expect(applyBump('0.1.1', 'major')).toBe('0.2.0');
    expect(applyBump('0.1.1', 'minor')).toBe('0.1.2');
    expect(applyBump('0.1.1', 'patch')).toBe('0.1.2');
  });

  it('follows normal semver at 1.0 and above', () => {
    expect(applyBump('1.2.3', 'major')).toBe('2.0.0');
    expect(applyBump('1.2.3', 'minor')).toBe('1.3.0');
    expect(applyBump('1.2.3', 'patch')).toBe('1.2.4');
  });
});

describe('renderNotes', () => {
  const commits = [
    { hash: 'aaaaaaaaaa', subject: 'feat(girih): add watch', body: '' },
    { hash: 'bbbbbbbbbb', subject: 'fix(girih-tokens): alias cycle', body: '' },
    { hash: 'cccccccccc', subject: 'refactor!: rename things', body: '' },
    { hash: 'dddddddddd', subject: 'chore: tidy', body: '' },
    { hash: 'eeeeeeeeee', subject: 'not a conventional subject', body: '' },
  ];
  const notes = renderNotes('0.2.0', commits, '2026-07-28');

  it('groups by kind, breaking first', () => {
    expect(notes.indexOf('### Breaking changes')).toBeLessThan(notes.indexOf('### Features'));
    expect(notes.indexOf('### Features')).toBeLessThan(notes.indexOf('### Bug fixes'));
  });

  it('shows the scope and a short hash', () => {
    expect(notes).toContain('- **girih:** add watch (aaaaaaa)');
    expect(notes).toContain('- **girih-tokens:** alias cycle (bbbbbbb)');
  });

  it('lists a breaking change under Breaking rather than its own type', () => {
    const breaking = notes.slice(notes.indexOf('### Breaking changes'), notes.indexOf('### Features'));
    expect(breaking).toContain('rename things');
  });

  it('omits noise and unparseable subjects', () => {
    expect(notes).not.toContain('tidy');
    expect(notes).not.toContain('not a conventional subject');
  });

  it('says so plainly when nothing user-facing changed', () => {
    // A lockstep release with no releasable commits still needs an honest entry rather
    // than an empty section implying a fix.
    expect(renderNotes('0.1.2', [{ hash: 'f'.repeat(10), subject: 'chore: tidy', body: '' }], '2026-07-28')).toContain(
      'No user-facing changes',
    );
  });
});
