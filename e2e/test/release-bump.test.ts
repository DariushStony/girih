import { describe, expect, it } from 'vitest';
import { applyBump as girihApplyBump } from '../../packages/girih/src/semver.js';
// @ts-expect-error — plain JS release tooling, deliberately not typed.
import { BUMP_BY_TYPE, NON_RELEASING_SCOPES, applyBump, parseCommit, renderNotes, strongest } from '../../scripts/lib/release-bump.mjs';

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

describe('scope gating', () => {
  // A commit's type says what kind of change it is; its scope says whether a consumer can
  // see it. Both matter. Missing this would have made the first automated release publish
  // a version identical to the one before it.
  it('does not release for a scope girih never publishes', () => {
    for (const scope of NON_RELEASING_SCOPES) {
      expect(parseCommit(`fix(${scope}): something`)?.bump, scope).toBe('none');
      expect(parseCommit(`feat(${scope}): something`)?.bump, scope).toBe('none');
    }
  });

  it('releases for a package scope', () => {
    expect(parseCommit('fix(girih-tokens): alias cycle')?.bump).toBe('patch');
    expect(parseCommit('feat(girih): add watch')?.bump).toBe('minor');
  });

  it('releases for a scopeless commit, since repo-wide could mean anything', () => {
    expect(parseCommit('fix: something')?.bump).toBe('patch');
  });

  it('releases for deps, which can change the published tree', () => {
    // The TypeScript 6 upgrade altered what consumers install.
    expect(parseCommit('build(deps): bump typescript')?.bump).toBe('patch');
  });

  it('applies the gate to breaking changes too', () => {
    // A breaking CI change is not breaking for a consumer.
    expect(parseCommit('ci!: restructure the pipeline')?.bump).toBe('none');
    expect(parseCommit('refactor!: rename packages')?.bump).toBe('major');
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

  // The regression that shipped in 0.1.1: the notes grouped on type while the version came
  // from the gates, so commits the gates had excluded still appeared — and a `ci!:` landed
  // under "Breaking changes", telling consumers a patch release broke something.
  it('excludes a commit the gates kept out of the bump', () => {
    const gated = renderNotes(
      '0.1.1',
      [
        { hash: 'a'.repeat(10), subject: 'ci!: release automatically on push', body: '' },
        { hash: 'b'.repeat(10), subject: 'fix(ci): refuse to guess a version', body: '' },
        { hash: 'c'.repeat(10), subject: 'feat(girih-core): add a help line', body: '' },
      ],
      '2026-07-28',
    );
    expect(gated).not.toContain('### Breaking changes');
    expect(gated).not.toContain('release automatically on push');
    expect(gated).not.toContain('refuse to guess a version');
    // The one commit that did move the version is still there.
    expect(gated).toContain('add a help line');
  });

  it('says so plainly when nothing user-facing changed', () => {
    // A lockstep release with no releasable commits still needs an honest entry rather
    // than an empty section implying a fix.
    expect(renderNotes('0.1.2', [{ hash: 'f'.repeat(10), subject: 'chore: tidy', body: '' }], '2026-07-28')).toContain(
      'No user-facing changes',
    );
  });
});
