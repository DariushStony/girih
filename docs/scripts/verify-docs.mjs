#!/usr/bin/env node
/**
 * Structural checks on the built documentation. Catches the failure modes that are easy to
 * introduce and invisible until someone opens a page: a dead link, an anchor that points at
 * nothing, a code block that would collapse its newlines, an unbalanced tag count.
 *
 * Usage:  node docs/scripts/verify-docs.mjs
 * Exits non-zero if anything fails.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const docsDir = join(repoRoot, 'docs');
const mdDir = join(docsDir, 'md');

const problems = [];
const notes = [];
let checks = 0;

const fail = (file, msg) => problems.push(`${file}: ${msg}`);
const check = (cond, file, msg) => {
  checks++;
  if (!cond) fail(file, msg);
};

const htmlFiles = readdirSync(docsDir).filter((f) => f.endsWith('.html'));
const mdFiles = existsSync(mdDir) ? readdirSync(mdDir).filter((f) => f.endsWith('.md')) : [];

if (htmlFiles.length === 0) {
  console.error('No HTML in docs/ — run: node docs/scripts/build-docs.mjs');
  process.exit(1);
}

/* ------------------------------------------------------------------ HTML checks */

for (const file of htmlFiles) {
  const html = readFileSync(join(docsDir, file), 'utf8');

  // Document shape.
  check(html.startsWith('<!doctype html>'), file, 'missing doctype — quirks mode will break the CSS');
  check(/<html lang="en">/.test(html), file, 'missing <html lang>');
  check(/<meta name="viewport"/.test(html), file, 'missing viewport meta — mobile will not scale');
  check(/<title>/.test(html), file, 'missing <title>');
  check(html.trimEnd().endsWith('</html>'), file, 'does not end with </html>');

  // Both themes must be addressable, and the explicit toggle must win both ways.
  check(/@media \(prefers-color-scheme: dark\)/.test(html), file, 'no prefers-color-scheme dark block');
  check(/:root\[data-theme='dark'\]/.test(html), file, "no :root[data-theme='dark'] override");
  check(/:root\[data-theme='light'\]/.test(html), file, "no :root[data-theme='light'] override");

  // Every code block must preserve newlines. This is the single easiest thing to get wrong.
  const preBlocks = [...html.matchAll(/<pre(\s[^>]*)?>/g)];
  check(preBlocks.length > 0, file, 'no <pre> blocks at all — suspicious');
  const hasPreWhitespaceRule = /white-space:\s*pre(-wrap)?/.test(html);
  check(hasPreWhitespaceRule, file, 'no white-space: pre rule found for code blocks');
  // Any styled div masquerading as a code block would need pre-wrap; we emit none.
  check(
    !/<div[^>]*class="[^"]*\bcodeblock\b/.test(html),
    file,
    'found a div-based code block; only <pre> is allowed',
  );

  // Tag balance for the containers that carry layout.
  for (const tag of ['div', 'figure', 'details', 'table', 'section']) {
    const open = (html.match(new RegExp(`<${tag}\\b`, 'g')) ?? []).length;
    const close = (html.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
    check(open === close, file, `unbalanced <${tag}>: ${open} open, ${close} close`);
  }

  // Internal links must resolve to a file that exists.
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1];
    if (href.startsWith('#') || /^(https?:|mailto:)/.test(href)) continue;
    const [path] = href.split('#');
    checks++;
    if (!existsSync(join(docsDir, path))) fail(file, `dead link → ${href}`);
  }

  // Duplicate IDs. This one is not pedantry: a section anchor colliding with a widget
  // root makes getElementById return the heading, so every lookup inside the widget
  // returns null and the widget silently never initialises.
  const allIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  const dupes = new Set();
  for (const id of allIds) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  check(dupes.size === 0, file, `duplicate id(s): ${[...dupes].join(', ')}`);

  // Every in-page anchor must have a target.
  const ids = new Set(allIds);
  for (const m of html.matchAll(/href="#([^"]+)"/g)) {
    checks++;
    if (!ids.has(m[1])) fail(file, `anchor #${m[1]} has no matching id`);
  }

  // A widget root must be reachable by getElementById — i.e. its id must be unique and
  // must not be shared with a heading. Widget ids are namespaced `w-` for that reason.
  for (const m of html.matchAll(/<div class="widget" id="([^"]+)"/g)) {
    checks++;
    const id = m[1];
    const occurrences = allIds.filter((x) => x === id).length;
    if (occurrences !== 1) fail(file, `widget root id "${id}" is not unique (${occurrences} elements)`);
    if (!id.startsWith('w-')) fail(file, `widget root id "${id}" should be namespaced "w-…"`);
  }

  // Accessibility basics we control.
  check(!/<img(?![^>]*\balt=)/.test(html), file, 'an <img> is missing alt');
  const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]{0,80}?)<\/button>/g)];
  for (const [full, inner] of buttons) {
    const labelled = /aria-label=/.test(full) || inner.replace(/<[^>]+>/g, '').trim().length > 0;
    checks++;
    if (!labelled) fail(file, 'a <button> has neither text content nor aria-label');
  }

  // Reduced motion + print are cheap and easy to forget.
  check(/@media \(prefers-reduced-motion: reduce\)/.test(html), file, 'no prefers-reduced-motion block');
}

/* -------------------------------------------------------------- Markdown checks */

for (const file of mdFiles) {
  const md = readFileSync(join(mdDir, file), 'utf8');
  const label = `md/${file}`;

  // Fences must be balanced or the rest of the page renders as code.
  const fences = (md.match(/^```/gm) ?? []).length;
  check(fences % 2 === 0, label, `unbalanced code fences (${fences})`);

  // No leftover HTML tags from the conversion, except the ones we deliberately keep.
  // Fenced code and inline code are excluded: `<BrandProvider>` and
  // `ComponentPropsWithoutRef<'button'>` are content there, not stray markup.
  const prose = md
    .replace(/^```[\s\S]*?^```/gm, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const stray = [...prose.matchAll(/<(\/?)([a-z]+)[^>]*>/gi)]
    .map((m) => m[2].toLowerCase())
    .filter((t) => !['details', 'summary', 'b', 'i', 'br', 'img', 'div', 'a'].includes(t));
  check(stray.length === 0, label, `leftover HTML tags from conversion: ${[...new Set(stray)].join(', ')}`);

  // Relative links to sibling docs must resolve.
  for (const m of md.matchAll(/\]\((?!https?:|#|mailto:)([^)]+)\)/g)) {
    const [path] = m[1].split('#');
    if (!path) continue;
    checks++;
    const resolved = path.startsWith('../') ? join(docsDir, path.slice(3)) : join(mdDir, path);
    if (!existsSync(resolved)) fail(label, `dead link → ${m[1]}`);
  }

  // A mirror page that lost its content is worse than no mirror.
  check(md.length > 1500, label, `suspiciously short (${md.length} bytes) — conversion may have dropped content`);
}

/* ---------------------------------------------------------------- data freshness */

const diagPath = join(docsDir, 'data/diagnostics.json');
const tokPath = join(docsDir, 'data/tokens.json');
for (const p of [diagPath, tokPath]) {
  checks++;
  if (!existsSync(p)) fail(relative(repoRoot, p), 'missing — run the extractor');
}

if (existsSync(tokPath)) {
  const tokens = JSON.parse(readFileSync(tokPath, 'utf8'));
  // The live widgets are worthless without the real emitted CSS.
  for (const key of ['styles/tokens.css', 'styles/components.css']) {
    check(
      typeof tokens.generated?.[key] === 'string' && tokens.generated[key].length > 500,
      'docs/data/tokens.json',
      `generated["${key}"] is missing or empty — the brand-switch widget will not work`,
    );
  }
  check(
    tokens.chains?.seller?.['button.radius']?.length >= 2,
    'docs/data/tokens.json',
    'the button.radius teaching chain is missing',
  );
  const sellerRadius = tokens.chains?.seller?.['button.radius']?.at(-1)?.resolved;
  const marketRadius = tokens.chains?.marketplace?.['button.radius']?.at(-1)?.resolved;
  check(
    sellerRadius !== marketRadius,
    'docs/data/tokens.json',
    `both brands resolve button.radius to ${sellerRadius} — the cascade demo proves nothing`,
  );
  notes.push(`button.radius resolves to ${marketRadius} (marketplace) / ${sellerRadius} (seller)`);
}

if (existsSync(diagPath)) {
  const diag = JSON.parse(readFileSync(diagPath, 'utf8'));
  check(diag.total > 50, 'docs/data/diagnostics.json', `only ${diag.total} codes extracted — parser may have broken`);
  const empty = diag.codes.filter((c) => !c.message);
  check(empty.length === 0, 'docs/data/diagnostics.json', `${empty.length} codes have no message`);
  notes.push(`${diag.total} diagnostics extracted; ${diag.codes.filter((c) => !c.help).length} lack a help line`);
}

/* ----------------------------------------------------------------------- report */

console.log(`Ran ${checks} checks over ${htmlFiles.length} HTML and ${mdFiles.length} Markdown files.`);
for (const note of notes) console.log(`  note: ${note}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
