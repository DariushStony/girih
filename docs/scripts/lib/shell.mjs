/**
 * The page shell: <head>, sidebar nav, page header, on-page TOC, pager, theme toggle.
 *
 * Emits two flavours from one source:
 *   mode 'file'     — a complete standalone HTML document for docs/*.html
 *   mode 'artifact' — body content only (the Artifact host supplies doctype/head/body)
 *                     with cross-page hrefs rewritten to published Artifact URLs.
 */
import { CSS, strapworkDataUri } from './theme.mjs';
import { esc } from './ui.mjs';

export const PAGES = [
  { slug: 'index', n: '00', title: 'Start here', nav: 'Start here', group: 'Orientation',
    blurb: 'What girih is, who it is for, and the one-paragraph version of how it works.' },
  { slug: '01-the-idea', n: '01', title: 'The idea', nav: 'The idea', group: 'Orientation',
    blurb: 'Why design systems drift, what a girih tile has to do with it, and the bet this project makes.' },
  { slug: '02-installation', n: '02', title: 'Installation', nav: 'Installation', group: 'Orientation',
    blurb: 'Get a working design system on your screen, from an empty folder, in about five minutes.' },
  { slug: '03-how-it-works', n: '03', title: 'How it works', nav: 'How it works', group: 'The model',
    blurb: 'The whole compile pipeline, one stage at a time, with real data moving through it.' },
  { slug: '04-tokens', n: '04', title: 'Tokens and brands', nav: 'Tokens & brands', group: 'The model',
    blurb: 'Three tiers, alias chains, and the override-only rule that lets one stylesheet serve every brand.' },
  { slug: '05-contracts', n: '05', title: 'Contracts and components', nav: 'Contracts', group: 'The model',
    blurb: 'How a contract you write as data becomes a typed, accessible React component you can read.' },
  { slug: '06-the-code', n: '06', title: 'The code', nav: 'The code', group: 'Reference',
    blurb: 'A guided tour of all nine packages: what each owns, and where to look when something breaks.' },
  { slug: '07-error-codes', n: '07', title: 'Every error code', nav: 'Error codes', group: 'Reference',
    blurb: 'All 70 GIRIH diagnostics, extracted from source, with what each one is actually telling you.' },
  { slug: '08-quiz', n: '08', title: 'Check yourself', nav: 'Quiz', group: 'Reference',
    blurb: 'Ten questions that are hard to answer unless you actually understood the model.' },
];

const GROUPS = ['Orientation', 'The model', 'Reference'];

/** The girih star mark, computed rather than hand-drawn. */
function starMark(size = 26) {
  const pts = [];
  const points = 10;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 11.5 : 5.1;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  const deca = [];
  for (let i = 0; i < points; i++) {
    const a = (Math.PI * 2 / points) * i - Math.PI / 2;
    deca.push(`${(12 + 11.5 * Math.cos(a)).toFixed(2)},${(12 + 11.5 * Math.sin(a)).toFixed(2)}`);
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <polygon points="${deca.join(' ')}" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.35"></polygon>
      <polygon points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="1.1"></polygon>
    </svg>`;
}

function sidebar(current, href) {
  const groups = GROUPS.map((group) => {
    const items = PAGES.filter((p) => p.group === group)
      .map((p) => {
        const active = p.slug === current ? ' aria-current="page"' : '';
        return `<li><a href="${esc(href(p.slug))}"${active}><span class="n">${esc(p.n)}</span><span>${esc(p.nav)}</span></a></li>`;
      })
      .join('\n        ');
    return `<div class="navgroup">
      <div class="label">${esc(group)}</div>
      <ol>
        ${items}
      </ol>
    </div>`;
  }).join('\n    ');

  return `<nav class="sidebar" aria-label="Documentation">
    <a class="brandmark" href="${esc(href('index'))}">
      ${starMark()}
      <span>
        <span class="wordmark">girih</span>
        <span class="persian"> گره</span>
      </span>
    </a>
    <p class="tagline">One warp, many wefts — compile multi-brand design systems from tokens and contracts.</p>
    ${groups}
  </nav>`;
}

function pager(current, href) {
  const i = PAGES.findIndex((p) => p.slug === current);
  const prev = i > 0 ? PAGES[i - 1] : null;
  const next = i >= 0 && i < PAGES.length - 1 ? PAGES[i + 1] : null;
  if (!prev && !next) return '';
  const left = prev
    ? `<a class="prev" href="${esc(href(prev.slug))}"><span class="dir">← Previous</span><span class="t">${esc(prev.title)}</span></a>`
    : '<span style="flex:1 1 0"></span>';
  const right = next
    ? `<a class="next" href="${esc(href(next.slug))}"><span class="dir">Next →</span><span class="t">${esc(next.title)}</span></a>`
    : '<span style="flex:1 1 0"></span>';
  return `<div class="pager">${left}${right}</div>`;
}

/** On-page TOC built from the page's own section list. */
function toc(sections) {
  if (!sections || sections.length < 2) return '';
  const items = sections
    .map((s) => `<li><a href="#${esc(s.id)}">${esc(s.title)}</a></li>`)
    .join('\n      ');
  return `<div class="toc">
    <div class="label">On this page</div>
    <ol>
      ${items}
    </ol>
  </div>`;
}

const THEME_SCRIPT = `
(function () {
  var root = document.documentElement;
  var key = 'girih-docs-theme';
  var saved = null;
  try { saved = localStorage.getItem(key); } catch (e) {}
  if (saved === 'dark' || saved === 'light') root.setAttribute('data-theme', saved);

  function label() {
    var explicit = root.getAttribute('data-theme');
    var dark = explicit ? explicit === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    return dark ? 'Light' : 'Dark';
  }
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.querySelector('.themetoggle');
    if (!btn) return;
    btn.textContent = label();
    btn.addEventListener('click', function () {
      var explicit = root.getAttribute('data-theme');
      var dark = explicit ? explicit === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      var nextTheme = dark ? 'light' : 'dark';
      root.setAttribute('data-theme', nextTheme);
      try { localStorage.setItem(key, nextTheme); } catch (e) {}
      btn.textContent = label();
    });
  });
})();
`;

/**
 * Render one page.
 *
 * @param {object} page      entry from PAGES
 * @param {object} opts      { mode, urls, sections, body, scripts }
 */
export function render(page, { mode = 'file', urls = {}, sections = [], body = '', scripts = '' } = {}) {
  // In artifact mode a sibling page lives at its own published URL; if we don't have
  // it yet, fall back to the index so a link is never dead.
  const href = (slug) => {
    if (mode !== 'artifact') return slug === 'index' ? 'index.html' : `${slug}.html`;
    return urls[slug] ?? urls.index ?? '#';
  };

  const strapLight = strapworkDataUri('%231B3B8F', '0.30');
  const inner = `
  <button class="themetoggle" type="button" aria-label="Switch colour theme">Dark</button>
  <div class="frame">
    ${sidebar(page.slug, href)}
    <main class="content">
      <header class="pagehead">
        <div class="wrap">
          <div class="eyebrow">${page.n === '00' ? 'Documentation' : `Chapter ${esc(page.n)}`} · ${esc(page.group)}</div>
          <h1>${esc(page.title)}</h1>
          <p class="standfirst">${esc(page.blurb)}</p>
        </div>
      </header>
      <div class="wrap">
        ${toc(sections)}
        ${body}
        ${pager(page.slug, href)}
      </div>
    </main>
  </div>
  <style>hr.strap { background-image: ${strapLight}; }</style>
  <script>${scripts}</script>`;

  if (mode === 'artifact') {
    // No doctype/html/head/body — the host wraps it. Styles go in a <style> tag.
    return `<title>girih docs — ${esc(page.title)}</title>
<style>${CSS}</style>
<script>${THEME_SCRIPT}</script>
${inner}
`;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>girih docs — ${esc(page.title)}</title>
<meta name="description" content="${esc(page.blurb)}">
<meta name="color-scheme" content="light dark">
<style>
/* Reset just enough to be predictable across browsers. */
html { -webkit-text-size-adjust: 100%; }
img, svg { max-width: 100%; }
${CSS}
</style>
<script>${THEME_SCRIPT}</script>
</head>
<body>
${inner}
</body>
</html>
`;
}
