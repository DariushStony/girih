#!/usr/bin/env node
/**
 * Extract every GIRIH diagnostic from the TypeScript sources into docs/data/diagnostics.json,
 * which docs/07-error-codes.html renders.
 *
 * Why a script and not a hand-written page: there are ~65 codes across 6 packages, and the
 * message/help strings are the real user-facing contract. A hand-written reference goes stale
 * silently the first time someone edits a help string. This does not.
 *
 * Usage:  node docs/scripts/extract-diagnostics.mjs
 *         node docs/scripts/extract-diagnostics.mjs --check    (exit 1 if the JSON is stale)
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const packagesDir = join(repoRoot, 'packages');
const outPath = join(repoRoot, 'docs/data/diagnostics.json');

/** Every .ts file under packages/<pkg>/src, tagged with its owning package. */
function sourceFiles() {
  const files = [];
  for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const src = join(packagesDir, pkg.name, 'src');
    if (!existsSync(src)) continue;
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) files.push({ pkg: pkg.name, path: full });
      }
    };
    walk(src);
  }
  return files;
}

/**
 * Walk `text` from `start` and return the index just past the construct that begins there,
 * skipping strings, template literals (including nested ${}), and comments. Returns null at EOF.
 * This is what makes brace matching correct: a `}` inside a string or a `${}` is not a brace.
 */
function skipAtomic(text, i) {
  const ch = text[i];
  if (ch === '/' && text[i + 1] === '/') {
    const nl = text.indexOf('\n', i);
    return nl === -1 ? text.length : nl;
  }
  if (ch === '/' && text[i + 1] === '*') {
    const end = text.indexOf('*/', i + 2);
    return end === -1 ? text.length : end + 2;
  }
  if (ch === "'" || ch === '"') {
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === '\\') {
        j++;
        continue;
      }
      if (text[j] === ch) return j + 1;
      if (text[j] === '\n') return j; // unterminated — bail rather than run away
    }
    return text.length;
  }
  if (ch === '`') {
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === '\\') {
        j++;
        continue;
      }
      if (text[j] === '`') return j + 1;
      if (text[j] === '$' && text[j + 1] === '{') {
        // Nested expression — walk it with full brace matching.
        let depth = 1;
        let k = j + 2;
        while (k < text.length && depth > 0) {
          const c = text[k];
          if (c === '{') {
            depth++;
            k++;
            continue;
          }
          if (c === '}') {
            depth--;
            k++;
            continue;
          }
          const next = skipAtomic(text, k);
          k = next !== null && next > k ? next : k + 1;
        }
        j = k - 1;
      }
    }
    return text.length;
  }
  return null;
}

/** Index of the `{` that opens the object literal containing `pos`. */
function findObjectStart(text, pos) {
  // Walk backward, counting braces. Backward scanning can't skip strings reliably,
  // so we validate the candidate by scanning forward from it and checking it spans pos.
  for (let i = pos; i >= 0; i--) {
    if (text[i] !== '{') continue;
    const end = findObjectEnd(text, i);
    if (end !== null && end > pos) return i;
  }
  return null;
}

/** Index just past the `}` matching the `{` at `open`. */
function findObjectEnd(text, open) {
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '{') {
      depth++;
      i++;
      continue;
    }
    if (ch === '}') {
      depth--;
      i++;
      if (depth === 0) return i;
      continue;
    }
    const next = skipAtomic(text, i);
    i = next !== null && next > i ? next : i + 1;
  }
  return null;
}

/** Split the body of an object literal into top-level `key: value` chunks. */
function topLevelProps(body) {
  const props = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '{' || ch === '[' || ch === '(') {
      depth++;
      i++;
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth--;
      i++;
      continue;
    }
    if (ch === ',' && depth === 0) {
      props.push(body.slice(start, i));
      start = i + 1;
      i++;
      continue;
    }
    const next = skipAtomic(body, i);
    i = next !== null && next > i ? next : i + 1;
  }
  props.push(body.slice(start));
  return props.map((p) => p.trim()).filter(Boolean);
}

/** `message: \`foo ${bar}\`` → { key: 'message', value: 'foo ${bar}', dynamic: true } */
function parseProp(prop) {
  const colon = prop.indexOf(':');
  if (colon === -1) return null;
  const key = prop
    .slice(0, colon)
    .trim()
    .replace(/^['"]|['"]$/g, '');
  let value = prop.slice(colon + 1).trim();
  const quoted = value.startsWith("'") || value.startsWith('"') || value.startsWith('`');
  const dynamic = value.startsWith('`') && value.includes('${');
  if (quoted) {
    const q = value[0];
    // Take the whole literal, including newlines inside a template.
    const end = skipAtomic(value, 0);
    value = value.slice(1, end - 1);
    if (q !== '`') value = value.replace(/\\'/g, "'").replace(/\\"/g, '"');
  }
  return { key, value, dynamic, literal: quoted };
}

const CODE_RE = /code:\s*'(GIRIH\d+)'/g;

const byCode = new Map();

for (const { pkg, path } of sourceFiles()) {
  const text = readFileSync(path, 'utf8');
  const rel = relative(repoRoot, path);
  for (const match of text.matchAll(CODE_RE)) {
    const open = findObjectStart(text, match.index);
    if (open === null) continue;
    const end = findObjectEnd(text, open);
    if (end === null) continue;
    const body = text.slice(open + 1, end - 1);

    const fields = {};
    for (const prop of topLevelProps(body)) {
      const parsed = parseProp(prop);
      if (parsed && ['code', 'severity', 'message', 'help'].includes(parsed.key)) {
        fields[parsed.key] = parsed;
      }
    }
    if (fields.code?.value !== match[1]) continue; // nested object, not this diagnostic

    const line = text.slice(0, match.index).split('\n').length;
    const entry = {
      code: match[1],
      severity: fields.severity?.literal ? fields.severity.value : 'dynamic',
      message: fields.message?.value ?? '',
      messageDynamic: Boolean(fields.message?.dynamic),
      help: fields.help?.value ?? null,
      helpDynamic: Boolean(fields.help?.dynamic),
      package: pkg,
      file: rel,
      line,
    };
    // A code can be raised from more than one site; keep them all, richest first.
    if (!byCode.has(entry.code)) byCode.set(entry.code, []);
    byCode.get(entry.code).push(entry);
  }
}

/** GIRIH2030 → 2; used to group the reference by owner. */
const FAMILIES = {
  1: { range: 'GIRIH1xxx', owner: 'core + cli', topic: 'Workspace, config, manifest, ds.lock' },
  2: { range: 'GIRIH2xxx', owner: 'tokens', topic: 'Parse, overlay, alias resolution, tier validation' },
  3: { range: 'GIRIH3xxx', owner: 'generator-css', topic: 'CSS emission' },
  4: { range: 'GIRIH4xxx', owner: 'spec', topic: 'Component contracts and extensions' },
  5: { range: 'GIRIH5xxx', owner: 'generator-react', topic: 'React emission' },
  6: { range: 'GIRIH6xxx', owner: 'cli', topic: 'Build and publish' },
};

const codes = [...byCode.entries()]
  .map(([_code, sites]) => {
    // Prefer the site that carries a help string — it is the most informative.
    const sorted = [...sites].sort((a, b) => (b.help ? 1 : 0) - (a.help ? 1 : 0));
    return { ...sorted[0], sites: sites.length, allSites: sites.map((s) => `${s.file}:${s.line}`) };
  })
  .sort((a, b) => (a.code < b.code ? -1 : 1));

const families = {};
for (const entry of codes) {
  const digit = Number(entry.code.slice(5, 6));
  const family = FAMILIES[digit] ?? { range: `GIRIH${digit}xxx`, owner: 'unknown', topic: 'Uncategorized' };
  families[digit] ??= { ...family, codes: [] };
  families[digit].codes.push(entry.code);
}

const payload = {
  generatedBy: 'docs/scripts/extract-diagnostics.mjs',
  note: 'Do not edit by hand. Re-run the script after changing any diagnostic in packages/*/src.',
  total: codes.length,
  bySeverity: codes.reduce((acc, c) => ({ ...acc, [c.severity]: (acc[c.severity] ?? 0) + 1 }), {}),
  families,
  codes,
};

const json = JSON.stringify(payload, null, 2) + '\n';

if (process.argv.includes('--check')) {
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (current !== json) {
    console.error(`docs/data/diagnostics.json is stale — run: node docs/scripts/extract-diagnostics.mjs`);
    process.exit(1);
  }
  console.log(`docs/data/diagnostics.json is up to date (${codes.length} codes).`);
} else {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, json, 'utf8');
  const counts = Object.entries(payload.bySeverity)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ');
  console.log(`Wrote ${relative(repoRoot, outPath)} — ${codes.length} codes (${counts}).`);
  for (const [_digit, family] of Object.entries(families)) {
    console.log(`  ${family.range.padEnd(10)} ${String(family.codes.length).padStart(2)} codes  ${family.owner}`);
  }
}
