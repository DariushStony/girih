#!/usr/bin/env node
/**
 * Pre-publish tarball audit. Packs every publishable package with pnpm and
 * inspects the real archive, because the two ways a first publish goes
 * unrecoverably wrong are both invisible to `--dry-run`:
 *
 *   1. dist/ is gitignored and the build never ran, so the tarball contains
 *      only package.json. npm accepts it and the version is burned forever.
 *   2. npm (as opposed to pnpm) copies `workspace:*` into the published
 *      manifest verbatim, and consumers fail with EUNSUPPORTEDPROTOCOL.
 *
 * pnpm is required: only its packer rewrites the workspace protocol to a real
 * version range. Run from the repo root.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const staging = mkdtempSync(join(tmpdir(), 'girih-pack-'));

/** Files that must never ship: sources, build caches, local tooling config. */
const FORBIDDEN = [/^src\//, /^\.turbo\//, /^tsconfig(\..*)?\.json$/, /^node_modules\//, /^\.npmrc$/, /^\.env/];

const failures = [];
const packages = readdirSync(join(root, 'packages'))
  .map((dir) => ({ dir, manifest: JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8')) }))
  .filter(({ manifest }) => !manifest.private)
  .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));

function fail(name, message) {
  failures.push(`${name}: ${message}`);
}

for (const { dir, manifest } of packages) {
  const packageDir = join(root, 'packages', dir);
  let tgz;
  try {
    // --json puts the tarball path on stdout without the human summary.
    const out = execFileSync('pnpm', ['pack', '--pack-destination', staging], { cwd: packageDir, encoding: 'utf8' });
    tgz = out
      .trim()
      .split('\n')
      .filter((l) => l.endsWith('.tgz'))
      .pop();
  } catch (error) {
    fail(manifest.name, `pnpm pack failed — ${error.message.split('\n')[0]}`);
    continue;
  }
  if (!tgz) {
    fail(manifest.name, 'pnpm pack produced no tarball path');
    continue;
  }

  const extracted = mkdtempSync(join(staging, 'x-'));
  execFileSync('tar', ['-xzf', tgz, '-C', extracted]);
  const pkg = join(extracted, 'package');

  const entries = execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((p) => p.replace(/^package\//, ''))
    .filter((p) => p && !p.endsWith('/'));

  // 1) The build actually ran.
  const js = entries.filter((p) => p.startsWith('dist/') && p.endsWith('.js'));
  if (js.length === 0) fail(manifest.name, 'no dist/*.js in the tarball — the build did not run (prepublishOnly missing or failed)');

  // 2) No unresolved workspace protocol in the published manifest.
  const published = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [dep, range] of Object.entries(published[field] ?? {})) {
      if (String(range).startsWith('workspace:')) {
        fail(manifest.name, `${field}.${dep} is still "${range}" — pack with pnpm, never npm`);
      }
    }
  }

  // 3) Declared entry points resolve inside the tarball.
  const targets = new Set();
  for (const entry of Object.values(published.exports ?? {})) {
    if (typeof entry === 'string') targets.add(entry);
    else for (const v of Object.values(entry ?? {})) if (typeof v === 'string') targets.add(v);
  }
  for (const bin of Object.values(published.bin ?? {})) targets.add(bin);
  if (published.main) targets.add(published.main);
  if (published.types) targets.add(published.types);
  for (const target of targets) {
    const rel = target.replace(/^\.\//, '');
    if (!entries.includes(rel)) fail(manifest.name, `${rel} is declared in the manifest but absent from the tarball`);
  }

  // 4) Executables are runnable: shebang present and the owner-execute bit set.
  for (const bin of Object.values(published.bin ?? {})) {
    const rel = bin.replace(/^\.\//, '');
    const path = join(pkg, rel);
    try {
      if (!readFileSync(path, 'utf8').startsWith('#!')) fail(manifest.name, `bin ${rel} has no shebang`);
      if (!(statSync(path).mode & 0o100)) fail(manifest.name, `bin ${rel} is not executable`);
    } catch {
      fail(manifest.name, `bin ${rel} is missing from the tarball`);
    }
  }

  // 5) No build noise or sources.
  for (const entry of entries) {
    if (FORBIDDEN.some((re) => re.test(entry))) fail(manifest.name, `ships ${entry} — tighten "files"`);
  }

  // 6) A blank npm page reads as abandoned; LICENSE keeps the MIT claim honest.
  if (!entries.some((p) => /^README(\.md)?$/i.test(p))) fail(manifest.name, 'no README.md — its npm page would render blank');
  if (!entries.some((p) => /^LICEN[SC]E/i.test(p)))
    fail(manifest.name, `declares "license": "${published.license}" but ships no LICENSE file`);

  const size = statSync(tgz).size;
  console.log(
    `${failures.length ? ' ' : ''}${manifest.name.padEnd(34)} ${String(entries.length).padStart(3)} files  ${(size / 1024).toFixed(0)} KB`,
  );
}

rmSync(staging, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s) — not publishable:\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\n✔ ${packages.length} packages pack cleanly`);
