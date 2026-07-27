#!/usr/bin/env node
/**
 * Compute the next version from conventional commits and apply every edit a girih
 * release needs. Writes files; commits nothing.
 *
 * girih's own rule is that a version comes from evidence rather than judgement — it is
 * the seventh invariant, applied to a consumer's design system by `girih publish`. This
 * is the same idea turned on girih itself: the bump is derived from the commits, not
 * typed by hand.
 *
 * Deliberately not release-please or changesets. Three things here defeat a generic tool:
 *   - internal deps use `workspace:*`; release-please's node-workspace plugin rewrites
 *     those into versions, which breaks how pnpm links siblings
 *   - two version ranges live in *source* and are asserted by tests
 *   - the emitted package.json is embedded in docs/data/tokens.json, so a bump makes the
 *     docs stale and they have to be regenerated in the same commit
 *
 * Usage:
 *   node scripts/release-prepare.mjs            # apply the edits
 *   node scripts/release-prepare.mjs --dry-run  # print the plan only
 *   node scripts/release-prepare.mjs --json     # machine-readable, for CI
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const asJson = args.has('--json');

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

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

/** Commits since the last release tag, newest last. */
function commitsSinceLastRelease() {
  let range;
  try {
    // stdio pipe: with no tags git writes "No names found" to stderr, which is an
    // expected state on a repo that has never been tagged, not something to show.
    const lastTag = execFileSync('git', ['describe', '--tags', '--match', 'v*', '--abbrev=0'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    range = `${lastTag}..HEAD`;
  } catch {
    // Never tagged: treat every commit as unreleased.
    range = 'HEAD';
  }
  // %x00 and %x1e are git's own escapes, so the argument stays printable ASCII —
  // embedding a real NUL in a process argument is not portable. A commit message can
  // contain neither byte, so fields and records split with no escaping.
  const FIELD = String.fromCharCode(0);
  const RECORD = String.fromCharCode(30);
  const raw = git('log', range, '--format=%H%x00%s%x00%b%x1e', '--no-merges');
  if (!raw) return [];
  return raw
    .split(RECORD)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash = '', subject = '', body = ''] = entry.split(FIELD);
      return { hash: hash.trim(), subject: subject.trim(), body: body.trim() };
    });
}

/** Publishable manifests. figma is private and deliberately excluded from releases. */
function publishablePackages() {
  return readdirSync(join(root, 'packages'))
    .map((dir) => ({ dir, path: join(root, 'packages', dir, 'package.json') }))
    .map((p) => ({ ...p, manifest: JSON.parse(readFileSync(p.path, 'utf8')) }))
    .filter((p) => !p.manifest.private);
}

/** Version ranges that ship inside published source and must match what is released. */
const SHIPPED_RANGES = [
  ['packages/girih-generator-react/src/generate.ts', /(export const RUNTIME_VERSION_RANGE = ')\^[\d.]+(')/],
  ['packages/create-girih/src/versions.ts', /(export const CLI_VERSION_RANGE = ')\^[\d.]+(')/],
  ['packages/create-girih/src/versions.ts', /(export const RUNTIME_VERSION_RANGE = ')\^[\d.]+(')/],
];

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

/**
 * Only runs when this file is the entry point. Importing it must be free of side
 * effects, or the test that pins the bump table would run git and rewrite manifests.
 */
function main() {
  /* ────────────────────────────── plan ────────────────────────────── */

  const commits = commitsSinceLastRelease();
  const packages = publishablePackages();
  const current = packages[0]?.manifest.version ?? '0.0.0';

  const parsed = commits.map((c) => parseCommit(c.subject, c.body));
  const bump = strongest(parsed.filter(Boolean).map((p) => p.bump));
  const next = applyBump(current, bump);

  const plan = {
    current,
    next,
    bump,
    releasable: bump !== 'none',
    commits: commits.length,
    counted: parsed.filter((p) => p && p.bump !== 'none').length,
    packages: packages.map((p) => p.manifest.name),
  };

  if (asJson) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } else {
    console.log(`current    ${current}`);
    console.log(`commits    ${commits.length} since the last release tag (${plan.counted} releasable)`);
    console.log(`bump       ${bump}${bump === 'none' ? '' : `  →  ${next}`}`);
  }

  if (!plan.releasable) {
    if (!asJson) console.log('\nNothing to release: no feat, fix, perf, revert or build commit since the last tag.');
    process.exit(0);
  }

  if (dryRun) {
    if (!asJson) console.log(`\n--dry-run: no files written.\n\n${renderNotes(next, commits, new Date().toISOString().slice(0, 10))}`);
    process.exit(0);
  }

  /* ────────────────────────────── apply ────────────────────────────── */

  const date = new Date().toISOString().slice(0, 10);

  for (const p of packages) {
    p.manifest.version = next;
    writeFileSync(p.path, `${JSON.stringify(p.manifest, null, 2)}\n`, 'utf8');
  }

  for (const [file, pattern] of SHIPPED_RANGES) {
    const path = join(root, file);
    const before = readFileSync(path, 'utf8');
    const after = before.replace(pattern, `$1^${next}$2`);
    if (after === before) throw new Error(`release-prepare: ${file} did not match ${pattern} — the range moved or was renamed`);
    writeFileSync(path, after, 'utf8');
  }

  const notes = renderNotes(next, commits, date);

  // Root changelog: newest release directly under the preamble.
  const rootPath = join(root, 'CHANGELOG.md');
  const rootText = readFileSync(rootPath, 'utf8');
  const firstRelease = rootText.search(/^## /m);
  writeFileSync(rootPath, `${rootText.slice(0, firstRelease)}${notes}\n${rootText.slice(firstRelease)}`, 'utf8');

  // Per-package changelogs point at the root rather than duplicating it: every package
  // ships on every release, so eight copies of the same notes would be eight copies to
  // keep honest.
  for (const p of packages) {
    const path = join(root, 'packages', p.dir, 'CHANGELOG.md');
    const text = readFileSync(path, 'utf8');
    const at = text.search(/^## /m);
    const entry = `## ${next} — ${date}\n\nReleased in lockstep with the rest of girih. See the\n[root changelog](../../CHANGELOG.md).\n\n`;
    writeFileSync(path, `${text.slice(0, at)}${entry}${text.slice(at)}`, 'utf8');
  }

  console.log(`\nwrote  ${packages.length} manifests, ${SHIPPED_RANGES.length} shipped ranges, ${packages.length + 1} changelogs`);
  console.log('next   run `pnpm docs:generate` — the emitted package.json is embedded in docs/data/tokens.json');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
