/**
 * The docs design system. One place, applied to all nine pages.
 *
 * Palette is drawn from Persian tile glazes — lapis and turquoise on ivory plaster,
 * manganese-dark at night — because girih is named after girih tilework and the
 * tiling idea *is* the architecture being documented.
 *
 * Both themes are defined at the token level: :root sets the light palette, the
 * prefers-color-scheme media query redefines only tokens, and the explicit
 * [data-theme] selectors redefine them again so a viewer's toggle wins in both
 * directions. Components are styled through tokens only, never inside the query.
 */

/** Geometry for the decagram used in dividers — computed, not hand-authored path data. */
function decagramPath({ points = 10, outer = 22, inner = 9.6, cx = 24, cy = 24 } = {}) {
  const coords = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    // -90° so a point sits at the top; girih stars are drawn point-up.
    const angle = (Math.PI / points) * i - Math.PI / 2;
    coords.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${coords.join('L')}Z`;
}

/** A decagon inscribed in the same circle — the tile the star is cut from. */
function decagonPath({ points = 10, r = 22, cx = 24, cy = 24 } = {}) {
  const coords = [];
  for (let i = 0; i < points; i++) {
    const angle = (Math.PI * 2 / points) * i - Math.PI / 2;
    coords.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${coords.join('L')}Z`;
}

/**
 * The strapwork divider: a repeating star-in-decagon band, encoded as a data URI so
 * it costs one CSS line per use and inherits no external requests.
 */
export function strapworkDataUri(stroke = '%231B3B8F', opacity = '0.30') {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'>` +
    `<g fill='none' stroke='${stroke}' stroke-opacity='${opacity}' stroke-width='1'>` +
    `<path d='${decagramPath()}'/><path d='${decagonPath()}'/>` +
    `<path d='M0,24 L48,24' stroke-opacity='${Number(opacity) / 2}'/>` +
    `</g></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/"/g, "'").replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
}

export const CSS = `
/* ============================================================================
   Tokens — light is the default; dark is redefined below at token level only.
   ============================================================================ */
:root {
  /* Glazes */
  --lapis:        #1B3B8F;
  --lapis-bright: #2C56C4;
  --turquoise:    #0E8F8F;
  --turquoise-br: #14A8A8;
  --ochre:        #BE7B1F;
  --madder:       #A8321E;

  /* Grounds and ink — neutrals biased a touch toward the lapis, not pure grey */
  --plaster:      #F6F5F1;
  --plaster-2:    #EFEEE8;
  --plaster-3:    #E4E3DB;
  --manganese:    #14181F;
  --ink:          #1E232B;
  --ink-2:        #4A5260;
  --ink-3:        #6E7789;

  /* Semantic surface roles */
  --bg:           var(--plaster);
  --bg-raised:    #FFFFFF;
  --bg-sunken:    var(--plaster-2);
  --bg-code:      #FBFAF7;
  --rule:         #DAD8CE;
  --rule-strong:  #C3C0B4;
  --text:         var(--ink);
  --text-muted:   var(--ink-2);
  --text-faint:   var(--ink-3);
  --accent:       var(--lapis);
  --accent-soft:  #E5EAF7;
  --good:         var(--turquoise);
  --good-soft:    #DCF0EF;
  --warn:         var(--ochre);
  --warn-soft:    #F8EEDA;
  --bad:          var(--madder);
  --bad-soft:     #F8E4E0;

  /* Type */
  --display: 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', 'URW Palladio L', Georgia, serif;
  --body:    Charter, 'Bitstream Charter', 'Source Serif 4', 'Source Serif Pro', Cambria, Georgia, serif;
  --util:    ui-sans-serif, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --mono:    ui-monospace, 'SF Mono', SFMono-Regular, 'Cascadia Code', 'JetBrains Mono', Menlo, Consolas, monospace;

  /* Scale — 1.25 from 17px, held to throughout */
  --t-xs:   0.75rem;
  --t-sm:   0.8125rem;
  --t-base: 1.0625rem;
  --t-lg:   1.1875rem;
  --t-xl:   1.45rem;
  --t-2xl:  1.85rem;
  --t-3xl:  2.35rem;
  --t-4xl:  2.95rem;

  --measure: 66ch;
  --sidebar: 16.5rem;
  --radius:  3px;
  --radius-lg: 6px;

  --shadow-1: 0 1px 2px rgba(20, 24, 31, 0.06), 0 1px 6px rgba(20, 24, 31, 0.04);
  --shadow-2: 0 2px 6px rgba(20, 24, 31, 0.08), 0 8px 24px rgba(20, 24, 31, 0.07);

  color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg:          var(--manganese);
    --bg-raised:   #1B212B;
    --bg-sunken:   #101419;
    --bg-code:     #171D26;
    --rule:        #2A323F;
    --rule-strong: #3C4655;
    --text:        #E7E9ED;
    --text-muted:  #A8B0BE;
    --text-faint:  #7C8697;
    --accent:      #7FA0EC;
    --accent-soft: #1C2740;
    --good:        #3FC7C1;
    --good-soft:   #10312F;
    --warn:        #E0A445;
    --warn-soft:   #33260F;
    --bad:         #E4705C;
    --bad-soft:    #351812;
    --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4), 0 1px 6px rgba(0, 0, 0, 0.3);
    --shadow-2: 0 2px 6px rgba(0, 0, 0, 0.45), 0 8px 24px rgba(0, 0, 0, 0.4);
  }
}

/* The viewer's explicit toggle must beat the OS preference in BOTH directions. */
:root[data-theme='dark'] {
  --bg:          var(--manganese);
  --bg-raised:   #1B212B;
  --bg-sunken:   #101419;
  --bg-code:     #171D26;
  --rule:        #2A323F;
  --rule-strong: #3C4655;
  --text:        #E7E9ED;
  --text-muted:  #A8B0BE;
  --text-faint:  #7C8697;
  --accent:      #7FA0EC;
  --accent-soft: #1C2740;
  --good:        #3FC7C1;
  --good-soft:   #10312F;
  --warn:        #E0A445;
  --warn-soft:   #33260F;
  --bad:         #E4705C;
  --bad-soft:    #351812;
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4), 0 1px 6px rgba(0, 0, 0, 0.3);
  --shadow-2: 0 2px 6px rgba(0, 0, 0, 0.45), 0 8px 24px rgba(0, 0, 0, 0.4);
}
:root[data-theme='light'] {
  --bg:          var(--plaster);
  --bg-raised:   #FFFFFF;
  --bg-sunken:   var(--plaster-2);
  --bg-code:     #FBFAF7;
  --rule:        #DAD8CE;
  --rule-strong: #C3C0B4;
  --text:        var(--ink);
  --text-muted:  var(--ink-2);
  --text-faint:  var(--ink-3);
  --accent:      var(--lapis);
  --accent-soft: #E5EAF7;
  --good:        var(--turquoise);
  --good-soft:   #DCF0EF;
  --warn:        var(--ochre);
  --warn-soft:   #F8EEDA;
  --bad:         var(--madder);
  --bad-soft:    #F8E4E0;
  --shadow-1: 0 1px 2px rgba(20, 24, 31, 0.06), 0 1px 6px rgba(20, 24, 31, 0.04);
  --shadow-2: 0 2px 6px rgba(20, 24, 31, 0.08), 0 8px 24px rgba(20, 24, 31, 0.07);
}

/* ============================================================================
   Base
   ============================================================================ */
* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--body);
  font-size: var(--t-base);
  line-height: 1.68;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  overflow-wrap: break-word;
}

::selection { background: var(--accent-soft); color: var(--text); }

:where(a) { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }
:where(a):hover { text-decoration-thickness: 2px; }

:where(a, button, summary, input, [tabindex]):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}

/* ============================================================================
   Frame: sidebar + content
   ============================================================================ */
.frame {
  display: grid;
  grid-template-columns: var(--sidebar) minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  border-inline-end: 1px solid var(--rule);
  background: var(--bg-sunken);
  padding: 1.75rem 1.25rem 3rem;
  position: sticky;
  top: 0;
  align-self: start;
  /* height, not max-height: a content-sized sticky column leaves the rail
     un-backgrounded below it on long pages. */
  height: 100vh;
  overflow-y: auto;
}

.brandmark {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.25rem;
  text-decoration: none;
  color: var(--text);
}
.brandmark svg { flex: none; }
.brandmark .wordmark {
  font-family: var(--display);
  font-size: var(--t-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
}
.brandmark .persian {
  font-size: var(--t-sm);
  color: var(--text-faint);
  font-family: var(--body);
}
.sidebar .tagline {
  margin: 0 0 1.5rem;
  font-size: var(--t-sm);
  color: var(--text-muted);
  line-height: 1.5;
}

.navgroup { margin-bottom: 1.35rem; }
.navgroup > .label {
  font-family: var(--util);
  font-size: 0.6875rem;
  font-weight: 650;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-bottom: 0.5rem;
}
.navgroup ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
.navgroup a {
  display: flex;
  gap: 0.55rem;
  align-items: baseline;
  padding: 0.32rem 0.5rem;
  border-radius: var(--radius);
  text-decoration: none;
  color: var(--text-muted);
  font-size: var(--t-sm);
  font-family: var(--util);
  line-height: 1.4;
}
.navgroup a:hover { background: var(--bg-raised); color: var(--text); }
.navgroup a[aria-current='page'] {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.navgroup a .n {
  font-variant-numeric: tabular-nums;
  color: var(--text-faint);
  font-size: var(--t-xs);
  flex: none;
  min-width: 1.1em;
}
.navgroup a[aria-current='page'] .n { color: var(--accent); }

.content { min-width: 0; padding: 0 0 6rem; }
.wrap { max-width: calc(var(--measure) + 14rem); margin: 0 auto; padding: 0 2rem; }
.prose { max-width: var(--measure); }

/* Wide things break out of the measure but never out of the page. */
.bleed { max-width: calc(var(--measure) + 11rem); }

/* ============================================================================
   Page header — construction lines at pentagonal angles, faint
   ============================================================================ */
.pagehead {
  border-block-end: 1px solid var(--rule);
  background:
    repeating-linear-gradient(72deg,  transparent 0 38px, color-mix(in oklab, var(--accent) 12%, transparent) 38px 39px),
    repeating-linear-gradient(-72deg, transparent 0 38px, color-mix(in oklab, var(--accent) 12%, transparent) 38px 39px),
    repeating-linear-gradient(36deg,  transparent 0 66px, color-mix(in oklab, var(--good) 9%, transparent) 66px 67px),
    var(--bg-sunken);
  padding: 3.25rem 0 2.5rem;
  margin-bottom: 2.5rem;
}
.pagehead .eyebrow {
  font-family: var(--util);
  font-size: var(--t-xs);
  font-weight: 650;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 0.6rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.pagehead h1 {
  font-family: var(--display);
  font-size: var(--t-4xl);
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin: 0 0 0.75rem;
  text-wrap: balance;
  font-weight: 600;
}
.pagehead .standfirst {
  margin: 0;
  font-size: var(--t-lg);
  color: var(--text-muted);
  max-width: 54ch;
  line-height: 1.55;
}

/* ============================================================================
   Typography in flow
   ============================================================================ */
h2, h3, h4 { font-family: var(--display); text-wrap: balance; letter-spacing: -0.01em; }
h2 {
  font-size: var(--t-2xl);
  line-height: 1.2;
  margin: 3.25rem 0 0.9rem;
  padding-block-start: 1.5rem;
  border-block-start: 1px solid var(--rule);
  font-weight: 600;
}
h2:first-child { margin-top: 0; border-block-start: 0; padding-block-start: 0; }
h3 { font-size: var(--t-xl); line-height: 1.28; margin: 2.25rem 0 0.6rem; font-weight: 600; }
h4 {
  font-family: var(--util);
  font-size: var(--t-sm);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 1.75rem 0 0.5rem;
}
p { margin: 0 0 1.15rem; }
.lede { font-size: var(--t-lg); color: var(--text-muted); line-height: 1.6; }

ul, ol { margin: 0 0 1.15rem; padding-inline-start: 1.35rem; }
li { margin-bottom: 0.4rem; }
li > ul, li > ol { margin-top: 0.4rem; margin-bottom: 0.5rem; }

strong { font-weight: 650; }
em { font-style: italic; }

code {
  font-family: var(--mono);
  font-size: 0.875em;
  background: var(--bg-sunken);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  padding: 0.08em 0.32em;
  overflow-wrap: break-word;
}
a code { color: inherit; }

hr.strap {
  border: 0;
  height: 48px;
  margin: 3rem 0;
  background-repeat: repeat-x;
  background-position: center;
  opacity: 0.5;
}

/* ============================================================================
   Code blocks — always white-space:pre, always scrollable on their own
   ============================================================================ */
figure.code {
  margin: 1.5rem 0;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--bg-code);
  overflow: hidden;
  box-shadow: var(--shadow-1);
}
figure.code > figcaption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0.85rem;
  border-block-end: 1px solid var(--rule);
  background: var(--bg-sunken);
  font-family: var(--util);
  font-size: var(--t-xs);
  color: var(--text-muted);
}
figure.code > figcaption .path {
  font-family: var(--mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}
figure.code > figcaption .badge {
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 0.625rem;
  padding: 0.12rem 0.4rem;
  border-radius: 999px;
  flex: none;
}
.badge.authored { background: var(--accent-soft); color: var(--accent); }
.badge.generated { background: var(--good-soft); color: var(--good); }
.badge.shell     { background: var(--bg-raised); color: var(--text-muted); border: 1px solid var(--rule); }

figure.code pre {
  margin: 0;
  padding: 0.9rem 1rem;
  overflow-x: auto;
  white-space: pre;
  font-family: var(--mono);
  font-size: var(--t-sm);
  line-height: 1.62;
  tab-size: 2;
}
figure.code pre code {
  background: none;
  border: 0;
  padding: 0;
  font-size: inherit;
  white-space: pre;
}

/* Minimal, honest highlighting: comments, strings, token refs, keywords. */
.tk-c { color: var(--text-faint); font-style: italic; }
.tk-s { color: var(--good); }
.tk-k { color: var(--accent); font-weight: 600; }
.tk-r { color: var(--warn); font-weight: 600; }
.tk-n { color: var(--text); }
.tk-del { color: var(--bad); }
.tk-add { color: var(--good); }

/* ============================================================================
   Callouts
   ============================================================================ */
.callout {
  margin: 1.5rem 0;
  padding: 0.95rem 1.1rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--rule);
  border-inline-start: 3px solid var(--accent);
  background: var(--bg-raised);
  font-size: calc(var(--t-base) * 0.97);
}
.callout > .title {
  font-family: var(--util);
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 0.35rem;
}
.callout > :last-child { margin-bottom: 0; }
.callout.eli5      { border-inline-start-color: var(--good); background: var(--good-soft); }
.callout.eli5 > .title { color: var(--good); }
.callout.rule      { border-inline-start-color: var(--lapis); }
.callout.gotcha    { border-inline-start-color: var(--warn); background: var(--warn-soft); }
.callout.gotcha > .title { color: var(--warn); }
.callout.danger    { border-inline-start-color: var(--bad); background: var(--bad-soft); }
.callout.danger > .title { color: var(--bad); }
.callout.skip      { border-inline-start-color: var(--rule-strong); background: var(--bg-sunken); color: var(--text-muted); }
.callout.skip > .title { color: var(--text-faint); }

details.aside {
  margin: 1.5rem 0;
  border: 1px dashed var(--rule-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-sunken);
  padding: 0 1.1rem;
}
details.aside > summary {
  cursor: pointer;
  padding: 0.8rem 0;
  font-family: var(--util);
  font-size: var(--t-sm);
  font-weight: 650;
  color: var(--text-muted);
  list-style-position: outside;
}
details.aside[open] > summary { border-block-end: 1px solid var(--rule); margin-block-end: 0.9rem; }
details.aside > :last-child { margin-bottom: 0.9rem; }

/* ============================================================================
   Tables
   ============================================================================ */
.tablewrap { overflow-x: auto; margin: 1.5rem 0; border: 1px solid var(--rule); border-radius: var(--radius-lg); }
table { border-collapse: collapse; width: 100%; font-size: var(--t-sm); font-family: var(--util); }
th, td { text-align: start; padding: 0.5rem 0.75rem; border-block-end: 1px solid var(--rule); vertical-align: top; }
thead th {
  background: var(--bg-sunken);
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
  white-space: nowrap;
}
tbody tr:last-child td { border-block-end: 0; }
tbody tr:hover { background: var(--bg-sunken); }
td code { font-size: 0.8125rem; }
.num { font-variant-numeric: tabular-nums; text-align: end; }

/* ============================================================================
   Diagram family 1 — tier stack
   ============================================================================ */
.tiers { display: flex; flex-direction: column; gap: 0; margin: 1.75rem 0; }
.tier {
  display: grid;
  grid-template-columns: 8.5rem minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
  padding: 0.85rem 1rem;
  border: 1px solid var(--rule);
  background: var(--bg-raised);
}
.tier:first-child { border-start-start-radius: var(--radius-lg); border-start-end-radius: var(--radius-lg); }
.tier:last-child { border-end-start-radius: var(--radius-lg); border-end-end-radius: var(--radius-lg); }
.tier + .tier { border-block-start: 0; }
.tier > .name { font-family: var(--util); font-size: var(--t-sm); font-weight: 700; }
.tier > .name .sub { display: block; font-weight: 400; color: var(--text-faint); font-size: var(--t-xs); letter-spacing: 0; text-transform: none; }
.tier[data-tier='global']    { border-inline-start: 3px solid var(--ink-3); }
.tier[data-tier='semantic']  { border-inline-start: 3px solid var(--good); }
.tier[data-tier='component'] { border-inline-start: 3px solid var(--accent); }
.tier[data-tier='global'] > .name    { color: var(--text-muted); }
.tier[data-tier='semantic'] > .name  { color: var(--good); }
.tier[data-tier='component'] > .name { color: var(--accent); }
.chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.chip {
  font-family: var(--mono);
  font-size: var(--t-xs);
  padding: 0.15rem 0.45rem;
  border-radius: var(--radius);
  border: 1px solid var(--rule);
  background: var(--bg-sunken);
  color: var(--text-muted);
  white-space: nowrap;
}
.chip.hot { border-color: var(--warn); background: var(--warn-soft); color: var(--warn); font-weight: 650; }
.chip.lit { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); font-weight: 650; }
.flowdown {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.15rem 1rem 0.15rem 9.6rem;
  font-family: var(--util);
  font-size: var(--t-xs);
  color: var(--text-faint);
}
.flowdown::before { content: '↓'; color: var(--accent); font-size: var(--t-lg); line-height: 1; }

/* ============================================================================
   Diagram family 2 — pipeline rail
   ============================================================================ */
.rail { margin: 1.75rem 0; overflow-x: auto; }
.rail > .track { display: flex; align-items: stretch; gap: 0; min-width: min-content; }
.stage {
  flex: 1 1 0;
  min-width: 8.5rem;
  border: 1px solid var(--rule);
  background: var(--bg-raised);
  padding: 0.7rem 0.8rem;
  position: relative;
}
.stage + .stage { border-inline-start: 0; }
.stage:first-child { border-start-start-radius: var(--radius-lg); border-end-start-radius: var(--radius-lg); }
.stage:last-child { border-start-end-radius: var(--radius-lg); border-end-end-radius: var(--radius-lg); }
.stage > .n {
  font-family: var(--util);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.stage > .t { font-family: var(--util); font-size: var(--t-sm); font-weight: 650; margin: 0.15rem 0 0.3rem; }
.stage > .d { font-size: var(--t-xs); color: var(--text-muted); line-height: 1.45; font-family: var(--util); }
.stage[data-on='true'] { background: var(--accent-soft); border-color: var(--accent); z-index: 1; }
.stage[data-on='true'] > .t { color: var(--accent); }
.stage[data-owner]::after {
  content: attr(data-owner);
  position: absolute;
  inset-block-end: 0.35rem;
  inset-inline-end: 0.5rem;
  font-family: var(--mono);
  font-size: 0.5625rem;
  color: var(--text-faint);
}

/* ============================================================================
   Diagram family 3 — package graph
   ============================================================================ */
.pkgmap { display: flex; flex-direction: column; gap: 0.6rem; margin: 1.75rem 0; }
.pkgrow { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.pkg {
  font-family: var(--mono);
  font-size: var(--t-sm);
  padding: 0.35rem 0.6rem;
  border-radius: var(--radius);
  border: 1px solid var(--rule-strong);
  background: var(--bg-raised);
  box-shadow: var(--shadow-1);
  white-space: nowrap;
}
.pkg .role { display: block; font-family: var(--util); font-size: 0.625rem; color: var(--text-faint); }
.pkg[data-layer='kernel']    { border-color: var(--ink-3); }
.pkg[data-layer='pipeline']  { border-color: var(--good); }
.pkg[data-layer='generator'] { border-color: var(--accent); }
.pkg[data-layer='surface']   { border-color: var(--warn); }
.dep { color: var(--text-faint); font-family: var(--util); font-size: var(--t-sm); flex: none; }

/* ============================================================================
   Diagram family 4 — var() chain
   ============================================================================ */
.chain { display: flex; flex-direction: column; gap: 0; margin: 1.5rem 0; }
.hop {
  display: grid;
  grid-template-columns: 6.5rem minmax(0, 1fr) auto;
  gap: 0.85rem;
  align-items: center;
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--rule);
  background: var(--bg-raised);
  font-family: var(--mono);
  font-size: var(--t-sm);
}
.hop + .hop { border-block-start: 0; }
.hop:first-child { border-start-start-radius: var(--radius-lg); border-start-end-radius: var(--radius-lg); }
.hop:last-child { border-end-start-radius: var(--radius-lg); border-end-end-radius: var(--radius-lg); }
.hop > .tierbadge {
  font-family: var(--util);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  text-align: center;
}
.hop[data-tier='global'] > .tierbadge    { background: var(--bg-sunken); color: var(--text-muted); border: 1px solid var(--rule-strong); }
.hop[data-tier='semantic'] > .tierbadge  { background: var(--good-soft); color: var(--good); }
.hop[data-tier='component'] > .tierbadge { background: var(--accent-soft); color: var(--accent); }
.hop > .val { text-align: end; color: var(--text-muted); white-space: nowrap; }
.hop[data-override='true'] { background: var(--warn-soft); border-color: var(--warn); }
.hop[data-override='true'] > .val { color: var(--warn); font-weight: 650; }
.hop.dim { opacity: 0.35; }
.hop .swatch {
  display: inline-block;
  width: 0.8em;
  height: 0.8em;
  border-radius: 2px;
  border: 1px solid var(--rule-strong);
  margin-inline-end: 0.35rem;
  vertical-align: -0.05em;
}

/* ============================================================================
   Widgets
   ============================================================================ */
.widget {
  margin: 2rem 0;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-raised);
  box-shadow: var(--shadow-2);
  overflow: hidden;
}
.widget > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.7rem 1rem;
  border-block-end: 1px solid var(--rule);
  background: var(--bg-sunken);
}
.widget > header .wt {
  font-family: var(--util);
  font-size: var(--t-sm);
  font-weight: 700;
  letter-spacing: 0.03em;
}
.widget > header .wh { font-family: var(--util); font-size: var(--t-xs); color: var(--text-muted); }
.widget > .body { padding: 1rem; }
.widget > .body > :first-child { margin-top: 0; }
.widget > .body > :last-child { margin-bottom: 0; }

.controls { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
button.btn, .seg > button {
  font-family: var(--util);
  font-size: var(--t-sm);
  font-weight: 600;
  padding: 0.4rem 0.8rem;
  border-radius: var(--radius);
  border: 1px solid var(--rule-strong);
  background: var(--bg-raised);
  color: var(--text);
  cursor: pointer;
}
button.btn:hover, .seg > button:hover { border-color: var(--accent); color: var(--accent); }
button.btn[disabled] { opacity: 0.45; cursor: not-allowed; }
button.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
:root[data-theme='dark'] button.btn.primary { color: var(--manganese); }
@media (prefers-color-scheme: dark) { button.btn.primary { color: var(--manganese); } }
:root[data-theme='light'] button.btn.primary { color: #fff; }

.seg { display: inline-flex; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--rule-strong); }
.seg > button { border: 0; border-radius: 0; }
.seg > button + button { border-inline-start: 1px solid var(--rule-strong); }
.seg > button[aria-pressed='true'] { background: var(--accent); color: #fff; }
:root[data-theme='dark'] .seg > button[aria-pressed='true'] { color: var(--manganese); }
@media (prefers-color-scheme: dark) { .seg > button[aria-pressed='true'] { color: var(--manganese); } }
:root[data-theme='light'] .seg > button[aria-pressed='true'] { color: #fff; }

select.sel {
  font-family: var(--mono);
  font-size: var(--t-sm);
  padding: 0.38rem 0.5rem;
  border-radius: var(--radius);
  border: 1px solid var(--rule-strong);
  background: var(--bg-raised);
  color: var(--text);
}

/* Quiz */
.quiz { display: flex; flex-direction: column; gap: 1.5rem; }
.q { border: 1px solid var(--rule); border-radius: var(--radius-lg); background: var(--bg-raised); overflow: hidden; }
.q > .stem { padding: 0.9rem 1rem; border-block-end: 1px solid var(--rule); background: var(--bg-sunken); }
.q > .stem .qn {
  font-family: var(--util);
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-faint);
  text-transform: uppercase;
}
.q > .stem p { margin: 0.3rem 0 0; }
.q > .stem pre {
  margin: 0.6rem 0 0;
  white-space: pre;
  overflow-x: auto;
  font-family: var(--mono);
  font-size: var(--t-xs);
  background: var(--bg-code);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  padding: 0.6rem 0.7rem;
  line-height: 1.6;
}
.opts { list-style: none; margin: 0; padding: 0.6rem; display: flex; flex-direction: column; gap: 0.4rem; }
.opts button {
  width: 100%;
  text-align: start;
  font-family: var(--body);
  font-size: calc(var(--t-base) * 0.95);
  line-height: 1.5;
  padding: 0.6rem 0.75rem;
  border-radius: var(--radius);
  border: 1px solid var(--rule);
  background: var(--bg-raised);
  color: var(--text);
  cursor: pointer;
  display: flex;
  gap: 0.6rem;
}
.opts button .k {
  font-family: var(--mono);
  font-size: var(--t-xs);
  font-weight: 700;
  color: var(--text-faint);
  flex: none;
  padding-top: 0.15em;
}
.opts button:hover:not([disabled]) { border-color: var(--accent); background: var(--accent-soft); }
.opts button[disabled] { cursor: default; }
.opts button[data-state='right'] { border-color: var(--good); background: var(--good-soft); }
.opts button[data-state='right'] .k { color: var(--good); }
.opts button[data-state='wrong'] { border-color: var(--bad); background: var(--bad-soft); }
.opts button[data-state='wrong'] .k { color: var(--bad); }
.verdict {
  margin: 0 0.6rem 0.6rem;
  padding: 0.7rem 0.85rem;
  border-radius: var(--radius);
  font-size: calc(var(--t-base) * 0.95);
  display: none;
}
.verdict[data-show='true'] { display: block; }
.verdict[data-ok='true'] { background: var(--good-soft); border: 1px solid var(--good); }
.verdict[data-ok='false'] { background: var(--bad-soft); border: 1px solid var(--bad); }
.verdict .vt { font-family: var(--util); font-weight: 700; font-size: var(--t-sm); }
.verdict[data-ok='true'] .vt { color: var(--good); }
.verdict[data-ok='false'] .vt { color: var(--bad); }
.verdict p { margin: 0.3rem 0 0; }
.score {
  font-family: var(--util);
  font-size: var(--t-sm);
  color: var(--text-muted);
  padding: 0.75rem 1rem;
  border: 1px dashed var(--rule-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-sunken);
}
.score b { color: var(--text); font-variant-numeric: tabular-nums; }

/* Live demo surface — hosts the real generated CSS */
.demosurface {
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  background: var(--bg-sunken);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.demorow { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
.demolabel {
  font-family: var(--util);
  font-size: var(--t-xs);
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-faint);
  min-width: 5.5rem;
}

/* Error-code reference */
.codelist { display: flex; flex-direction: column; gap: 0.5rem; }
.codecard {
  border: 1px solid var(--rule);
  border-inline-start: 3px solid var(--rule-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-raised);
  padding: 0.75rem 0.9rem;
}
.codecard[data-sev='error'] { border-inline-start-color: var(--bad); }
.codecard[data-sev='warning'] { border-inline-start-color: var(--warn); }
.codecard > .top { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; }
.codecard .cid { font-family: var(--mono); font-size: var(--t-sm); font-weight: 700; }
.codecard[data-sev='error'] .cid { color: var(--bad); }
.codecard[data-sev='warning'] .cid { color: var(--warn); }
.codecard .sev {
  font-family: var(--util);
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
}
.codecard[data-sev='error'] .sev { background: var(--bad-soft); color: var(--bad); }
.codecard[data-sev='warning'] .sev { background: var(--warn-soft); color: var(--warn); }
.codecard .src { font-family: var(--mono); font-size: var(--t-xs); color: var(--text-faint); margin-inline-start: auto; }
.codecard .msg {
  font-family: var(--mono);
  font-size: var(--t-sm);
  margin: 0.4rem 0 0;
  white-space: pre-wrap;
  line-height: 1.55;
}
.codecard .help {
  margin: 0.4rem 0 0;
  font-size: calc(var(--t-base) * 0.93);
  color: var(--text-muted);
  padding-inline-start: 0.7rem;
  border-inline-start: 2px solid var(--rule);
}
.ph { color: var(--ochre); background: var(--warn-soft); border-radius: 2px; padding: 0 0.15em; font-style: normal; }
:root[data-theme='dark'] .ph { color: var(--warn); }
.filterbar {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
  margin: 1.25rem 0;
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--bg-sunken);
  position: sticky;
  top: 0.5rem;
  z-index: 5;
}
.filterbar input {
  flex: 1 1 12rem;
  font-family: var(--util);
  font-size: var(--t-sm);
  padding: 0.4rem 0.6rem;
  border-radius: var(--radius);
  border: 1px solid var(--rule-strong);
  background: var(--bg-raised);
  color: var(--text);
}
.hidden { display: none !important; }

/* ============================================================================
   Cards / next steps
   ============================================================================ */
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 0.85rem; margin: 1.75rem 0; }
.card {
  display: block;
  padding: 0.95rem 1rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--bg-raised);
  text-decoration: none;
  color: var(--text);
  box-shadow: var(--shadow-1);
}
.card:hover { border-color: var(--accent); box-shadow: var(--shadow-2); }
.card .n {
  font-family: var(--util);
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.card .h { font-family: var(--display); font-size: var(--t-lg); font-weight: 600; margin: 0.2rem 0 0.3rem; }
.card .d { font-size: var(--t-sm); color: var(--text-muted); line-height: 1.5; font-family: var(--util); }

/* On-page table of contents */
.toc {
  margin: 0 0 2.5rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--bg-sunken);
}
.toc > .label {
  font-family: var(--util);
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-bottom: 0.45rem;
}
.toc ol { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 1.5rem; }
.toc li { margin: 0 0 0.25rem; break-inside: avoid; }
.toc a { font-family: var(--util); font-size: var(--t-sm); text-decoration: none; }
.toc a:hover { text-decoration: underline; }

/* Prev / next */
.pager { display: flex; gap: 0.85rem; margin-top: 3.5rem; padding-top: 1.5rem; border-top: 1px solid var(--rule); }
.pager a {
  flex: 1 1 0;
  padding: 0.85rem 1rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  text-decoration: none;
  background: var(--bg-raised);
}
.pager a:hover { border-color: var(--accent); }
.pager a .dir { font-family: var(--util); font-size: var(--t-xs); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-faint); }
.pager a .t { display: block; font-family: var(--display); font-size: var(--t-lg); margin-top: 0.15rem; color: var(--text); }
.pager a.next { text-align: end; }

/* Theme toggle */
.themetoggle {
  position: fixed;
  inset-block-start: 0.85rem;
  inset-inline-end: 0.85rem;
  z-index: 20;
  font-family: var(--util);
  font-size: var(--t-xs);
  font-weight: 650;
  padding: 0.4rem 0.65rem;
  border-radius: 999px;
  border: 1px solid var(--rule-strong);
  background: var(--bg-raised);
  color: var(--text-muted);
  cursor: pointer;
  box-shadow: var(--shadow-1);
}
.themetoggle:hover { color: var(--accent); border-color: var(--accent); }

/* ============================================================================
   Responsive
   ============================================================================ */
@media (max-width: 60rem) {
  .frame { grid-template-columns: 1fr; }
  .sidebar {
    position: static;
    /* height:auto is required — the desktop rule pins it to 100vh, which on a phone
       would push the entire article below the fold. */
    height: auto;
    max-height: none;
    overflow-y: visible;
    border-inline-end: 0;
    border-block-end: 1px solid var(--rule);
    padding-bottom: 1.25rem;
  }
  .navgroup ol { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: 2px; }
  .wrap { padding: 0 1.15rem; }
  .pagehead { padding: 2.25rem 0 1.75rem; margin-bottom: 1.75rem; }
  .pagehead h1 { font-size: var(--t-3xl); }
  .toc ol { columns: 1; }
  .tier { grid-template-columns: 1fr; gap: 0.5rem; }
  .flowdown { padding-inline-start: 1rem; }
  .hop { grid-template-columns: 5rem minmax(0, 1fr); }
  .hop > .val { grid-column: 1 / -1; text-align: start; }
  .pager { flex-direction: column; }
  .pager a.next { text-align: start; }
  .themetoggle { inset-block-start: auto; inset-block-end: 0.85rem; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}

@media print {
  .sidebar, .themetoggle, .pager, .filterbar { display: none; }
  .frame { grid-template-columns: 1fr; }
  body { background: #fff; color: #000; }
}
`;
