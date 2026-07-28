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
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const docsDir = join(repoRoot, 'docs');
const mdDir = join(docsDir, 'md');

const problems = [];
/** page → its element ids, filled during the HTML pass and used for cross-page anchors. */
const idsByPage = new Map();
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
  check(!/<div[^>]*class="[^"]*\bcodeblock\b/.test(html), file, 'found a div-based code block; only <pre> is allowed');

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
  idsByPage.set(file, ids);
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

// Cross-page anchors. The in-page check above only sees `href="#id"`; a link to
// `04-tokens.html#overlay` was silently broken because nothing compared it against that
// page's ids. Only checked for pages this build produced — external links are not ours.
for (const [file, ids] of idsByPage) {
  void ids;
  const html = readFileSync(join(docsDir, file), 'utf8');
  for (const m of html.matchAll(/href="([0-9a-z-]+\.html)#([^"]+)"/g)) {
    checks++;
    const [, target, anchor] = m;
    const targetIds = idsByPage.get(target);
    if (!targetIds) continue; // not a page we generated
    if (!targetIds.has(anchor)) fail(file, `anchor ${target}#${anchor} has no matching id in ${target}`);
  }
}

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

/* ------------------------------------------------------------------ brand assets */

/**
 * Every icon, manifest and social image the pages reference must actually exist, and be
 * the size it claims. A broken favicon link is invisible in review and obvious to a
 * visitor; a mis-sized og:image is silently rejected by scrapers.
 */
{
  const required = [
    ['favicon.ico', null],
    ['favicon.svg', null],
    ['apple-touch-icon.png', [180, 180]],
    ['site.webmanifest', null],
    ['og-card.png', [1200, 630]],
    ['icons/icon-16.png', [16, 16]],
    ['icons/icon-32.png', [32, 32]],
    ['icons/icon-192.png', [192, 192]],
    ['icons/icon-512.png', [512, 512]],
    ['icons/maskable-512.png', [512, 512]],
    ['brand/logomark.svg', null],
    ['brand/lockup-light.png', null],
    ['brand/lockup-dark.png', null],
    ['brand/github-social-preview.png', [1280, 640]],
    ['brand/README.md', null],
  ];
  for (const [rel, dims] of required) {
    const full = join(docsDir, rel);
    checks++;
    if (!existsSync(full)) {
      fail(`docs/${rel}`, 'missing — run: node docs/scripts/build-icons.mjs');
      continue;
    }
    if (dims) {
      // PNG IHDR: width and height live at fixed offsets.
      const buf = readFileSync(full);
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      check(w === dims[0] && h === dims[1], `docs/${rel}`, `is ${w}x${h}, expected ${dims[0]}x${dims[1]}`);
    }
  }

  // The .ico must be a real container, not a renamed PNG.
  const ico = readFileSync(join(docsDir, 'favicon.ico'));
  check(ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1, 'docs/favicon.ico', 'not a valid ICO header');
  const icoCount = ico.readUInt16LE(4);
  check(icoCount >= 2, 'docs/favicon.ico', `only ${icoCount} image(s) — want at least 16 and 32`);

  // The manifest must parse and point at files that exist.
  const manifest = JSON.parse(readFileSync(join(docsDir, 'site.webmanifest'), 'utf8'));
  check(Boolean(manifest.name && manifest.short_name), 'docs/site.webmanifest', 'missing name/short_name');
  check(Boolean(manifest.theme_color && manifest.background_color), 'docs/site.webmanifest', 'missing theme/background colour');
  check(
    manifest.icons?.some((i) => i.purpose === 'maskable'),
    'docs/site.webmanifest',
    'no maskable icon — Android will letterbox the icon',
  );
  for (const icon of manifest.icons ?? []) {
    checks++;
    const target = join(docsDir, icon.src.replace(/^\.\//, ''));
    if (!existsSync(target)) fail('docs/site.webmanifest', `icon src does not exist: ${icon.src}`);
  }

  // Every page must reference the icon set and carry a social card.
  for (const file of htmlFiles) {
    const html = readFileSync(join(docsDir, file), 'utf8');
    check(/rel="icon"[^>]*favicon\.svg/.test(html), file, 'no SVG favicon link');
    check(/rel="manifest"/.test(html), file, 'no manifest link');
    check(/property="og:image"/.test(html), file, 'no og:image');
    check(/name="theme-color"/.test(html), file, 'no theme-color');
  }
  notes.push(
    `brand assets present; og:image is ${
      /content="https?:\/\//.test(
        readFileSync(join(docsDir, 'index.html'), 'utf8').match(/property="og:image" content="([^"]*)"/)?.[0] ?? '',
      )
        ? 'absolute'
        : 'RELATIVE — most scrapers need an absolute URL; rebuild with --site-url once Pages is live'
    }`,
  );
}

/* ---------------------------------------------------- embedded snippets are real */

/**
 * No rendered code block may be empty.
 *
 * The chapters embed real files from the example workspace by key —
 * `data.generated['src/button.tsx']` — each with a `?? ''` fallback. When a key stops
 * matching, `code()` still renders its frame and caption, so the page shows a captioned
 * empty box claiming "girih writes this" and every other check passes.
 *
 * That is not hypothetical: the design/ restructure renamed all nine source keys and the
 * kebab-case rename renamed the generated ones. Any one of those missed in the extractor
 * would have blanked a chapter's central exhibit silently.
 *
 * A `<code>` carrying attributes is a widget template that JavaScript fills at view time
 * (the pipeline stepper's `data-s-data`), so it is empty on purpose and skipped. Matching
 * the attributes explicitly rather than treating a failed match as empty content is the
 * difference between this check and one that fails on every page with a widget.
 */
{
  for (const file of htmlFiles) {
    const html = readFileSync(join(docsDir, file), 'utf8');
    for (const m of html.matchAll(/<figure class="code"[^>]*>([\s\S]*?)<\/figure>/g)) {
      const figure = m[1];
      const block = figure.match(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/);
      if (!block || block[1].trim().length > 0) continue;
      const caption = figure.match(/<span class="path"[^>]*>([^<]*)<\/span>/)?.[1] ?? '(uncaptioned)';
      check(block[2].trim().length > 0, file, `code block '${caption}' rendered empty — its extracted key probably stopped matching`);
    }
  }
}

/* --------------------------------------------------- attributed files still exist */

/**
 * A code block captioned with a `packages/...` path must be captioned with a path that
 * exists. Chapter 03 showed `composeReact()` attributed to `packages/girih/src/cli.ts` long
 * after it moved to `workspace.ts` — the snippet was accurate, the file it named was not,
 * and a reader following the caption finds command registration instead.
 *
 * Only paths whose first segment is a real workspace package are checked. A consumer's
 * generated package is also called `packages/design-system/...`, and it is gitignored here,
 * so those captions describe a workspace that legitimately does not exist in this repo.
 * Deriving the package list from disk rather than listing it keeps that distinction true as
 * packages come and go.
 */
{
  const workspacePackages = new Set(readdirSync(join(repoRoot, 'packages')));
  for (const dir of [join(docsDir, 'scripts/pages'), join(docsDir, 'scripts/lib')]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
      const rel = relative(repoRoot, join(dir, name));
      readFileSync(join(dir, name), 'utf8')
        .split('\n')
        .forEach((line, index) => {
          for (const m of line.matchAll(/['"`](packages\/([\w.-]+)\/[\w./-]+\.\w+)\b/g)) {
            if (!workspacePackages.has(m[2])) continue;
            check(existsSync(join(repoRoot, m[1])), `${rel}:${index + 1}`, `attributes a snippet to '${m[1]}', which does not exist`);
          }
        });
    }
  }
}

/* ------------------------------------------------------------- source integrity */

/**
 * Parse every build script. Two mistakes here are easy to make and produce confusing
 * failures: a stray backtick inside a template literal (which silently ends it), and a
 * path containing an asterisk-slash inside a block comment (which ends the comment
 * early). Both have happened; both are caught by simply asking Node to parse the file.
 */
{
  const scriptDirs = [join(docsDir, 'scripts'), join(docsDir, 'scripts/lib'), join(docsDir, 'scripts/pages')];
  for (const dir of scriptDirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
      const full = join(dir, name);
      const rel = relative(repoRoot, full);
      checks++;
      const res = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
      if (res.status !== 0) {
        fail(rel, `does not parse — ${(res.stderr || '').split('\n').find((l) => /Error/.test(l)) ?? 'syntax error'}`);
      }
    }
  }
}

/* ------------------------------------------------------- symbols that still exist */

/**
 * Every girih identifier the docs name in a `<code>` tag must still be declared somewhere in
 * packages/&#42;/src.
 *
 * This is the one staleness class every other check here is blind to. Links, anchors, counts
 * and code fences can all be perfectly valid while the prose confidently describes an export
 * that was deleted — `DiagnosticBag` and `formatDiagnostic` survived a whole refactor in
 * core's file table exactly that way, with 708 checks passing.
 *
 * Declared, not exported: the chapters teach internals by name (`dependentsClosure`,
 * `detectVarNameCollisions`), which is the useful level of detail and not something to punish.
 * The question is only whether the name still refers to anything.
 *
 * Scans the page scripts rather than the built HTML or Markdown, so a failure points at the
 * line you have to edit. The two are generated from these, so coverage is the same.
 */
{
  const declared = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        const source = readFileSync(full, 'utf8');
        for (const m of source.matchAll(/(?:function|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
        // Config keys and IR fields are documented the same way functions are.
        for (const m of source.matchAll(/^\s*([A-Za-z_$][\w$]*)\??:/gm)) declared.add(m[1]);
      }
    }
  };
  const packagesDir = join(repoRoot, 'packages');
  for (const pkg of readdirSync(packagesDir)) {
    const src = join(packagesDir, pkg, 'src');
    if (existsSync(src)) walk(src);
  }

  // Not ours. Each entry is a claim that the name belongs to someone else's API, so a symbol
  // girih deletes can never be excused by sitting here.
  const FOREIGN = new Set([
    'forwardRef', // react
    'afterAll', // vitest
    'resolveReferences', // style-dictionary
    'usesDtcg', // style-dictionary
    'moduleResolution', // tsconfig
    // Emitted from the example's own contracts — they exist in generated output, not in src.
    'ButtonProps',
    'ButtonSize',
    'ButtonVariant',
    'PaymentButton',
  ]);

  const pageDirs = [join(docsDir, 'scripts/pages'), join(docsDir, 'scripts/lib')];
  for (const dir of pageDirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
      const rel = relative(repoRoot, join(dir, name));
      const lines = readFileSync(join(dir, name), 'utf8').split('\n');
      lines.forEach((line, index) => {
        for (const m of line.matchAll(/<code>([A-Za-z_$][\w$]*)(?:\(\))?<\/code>/g)) {
          const id = m[1];
          // Needs a capital to be a plausible identifier rather than an English word or a
          // shell word; SCREAMING_CASE is a constant or a placeholder like GIRIH4xxx, and
          // diagnostic codes have their own check against the extracted catalog.
          if (!/[A-Z]/.test(id) || /^[A-Z0-9_]+$/.test(id) || id.startsWith('GIRIH')) continue;
          if (FOREIGN.has(id)) continue;
          check(declared.has(id), `${rel}:${index + 1}`, `documents '${id}', which is not declared anywhere in packages/*/src`);
        }
      });
    }
  }
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
  check(tokens.chains?.seller?.['button.radius']?.length >= 2, 'docs/data/tokens.json', 'the button.radius teaching chain is missing');
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
