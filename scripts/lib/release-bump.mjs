/**
 * How a release version and its notes are derived from conventional commits.
 *
 * Pure: no git, no filesystem, no process. Split out of release-prepare.mjs so the tests
 * import a library rather than an executable — a test that has to load a script with a
 * shebang and top-level side effects is coupled to how that script runs, not to what it
 * decides.
 */

/**
 * Which commit types force a release, and how hard.
 *
 * `build` counts because it changes what ships — the TypeScript 6 upgrade altered the
 * published dependency tree. `refactor` does not: by definition it should not change
 * behaviour, and when one does it carries `!`, which outranks the type anyway.
 * scripts/../test/release-bump.test.ts pins this table.
 */
export const BUMP_BY_TYPE = {
  feat: 'minor',
  fix: 'patch',
  perf: 'patch',
  revert: 'patch',
  build: 'patch',
  docs: 'none',
  chore: 'none',
  test: 'none',
  ci: 'none',
  style: 'none',
  refactor: 'none',
};

const RANK = { none: 0, patch: 1, minor: 2, major: 3 };

/** Highest bump wins. */
export function strongest(bumps) {
  return bumps.reduce((worst, b) => (RANK[b] > RANK[worst] ? b : worst), 'none');
}

/**
 * The pre-1.0 convention, matching packages/girih/src/semver.ts exactly: below 1.0 a
 * breaking change moves the minor and a feature moves the patch, because 0.x has no
 * stable major to break. Reimplemented rather than imported because that file is
 * TypeScript and this is a plain script; test/release-bump.test.ts asserts the two agree
 * so they cannot drift.
 */
export function applyBump(version, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return version;
  let [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const preOneStable = major === 0;
  if (bump === 'major') {
    if (preOneStable) {
      minor += 1;
      patch = 0;
    } else {
      major += 1;
      minor = 0;
      patch = 0;
    }
  } else if (bump === 'minor') {
    if (preOneStable) patch += 1;
    else {
      minor += 1;
      patch = 0;
    }
  } else if (bump === 'patch') {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

/**
 * `type(scope)!: subject` → its parts, or null when the subject is not conventional.
 *
 * The type must be one this project recognises, not merely a word before a colon —
 * otherwise the repo's legacy `M6: packaging and publish` subjects parse as type "M6"
 * and land in the release notes. commitlint enforces the same set on new commits, so
 * anything outside it is legacy or a mistake either way.
 */
export function parseCommit(subject, body = '') {
  const types = Object.keys(BUMP_BY_TYPE).join('|');
  const match = new RegExp(`^(${types})(?:\\(([^)]*)\\))?(!)?:\\s*(.+)$`).exec(subject);
  if (!match) return null;
  const [, type, scope, bang, description] = match;
  // A `!` or a BREAKING CHANGE footer outranks whatever the type would say.
  const breaking = Boolean(bang) || /^BREAKING[ -]CHANGE:/m.test(body);
  const bump = breaking ? 'major' : (BUMP_BY_TYPE[type] ?? 'none');
  return { type, scope: scope ?? null, breaking, description, bump };
}

const TYPE_HEADINGS = [
  ['major', 'Breaking changes'],
  ['feat', 'Features'],
  ['fix', 'Bug fixes'],
  ['perf', 'Performance'],
  ['revert', 'Reverts'],
  ['build', 'Build and dependencies'],
];

/** Release notes grouped by kind, with the scope and short hash on each line. */
export function renderNotes(version, commits, date) {
  const parsed = commits.map((c) => ({ ...c, parsed: parseCommit(c.subject, c.body) })).filter((c) => c.parsed);
  const lines = [`## ${version} — ${date}`, ''];
  let wroteAnything = false;

  for (const [key, heading] of TYPE_HEADINGS) {
    const group = parsed.filter((c) => (key === 'major' ? c.parsed.breaking : !c.parsed.breaking && c.parsed.type === key));
    if (group.length === 0) continue;
    wroteAnything = true;
    lines.push(`### ${heading}`, '');
    for (const c of group) {
      const scope = c.parsed.scope ? `**${c.parsed.scope}:** ` : '';
      lines.push(`- ${scope}${c.parsed.description} (${c.hash.slice(0, 7)})`);
    }
    lines.push('');
  }

  if (!wroteAnything) {
    lines.push('No user-facing changes; released in lockstep with the rest of girih.', '');
  }
  return lines.join('\n');
}
