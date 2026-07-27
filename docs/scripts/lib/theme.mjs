/**
 * The docs design system — Safavid Isfahan.
 *
 * The palette is the tile world of the Shah Mosque and the Sheikh Lotfollah: cobalt
 * (lājvard) and turquoise (fīrūzeh) glaze over ivory plaster, with saffron for
 * emphasis, madder for alarm, and manganese for the dark outlines that separate every
 * glazed field. Ornament is girih strapwork and the ten-fold star.
 *
 * Every categorical colour used to encode data was validated with the dataviz
 * validator (all-pairs, both modes) rather than chosen by eye. Ordered dimensions —
 * token tier, package layer — use a single-hue sequential ramp, which is monotonic in
 * lightness and therefore safe by construction.
 *
 * Both themes are defined at token level: :root is light, prefers-color-scheme
 * redefines only tokens, and explicit [data-theme] selectors redefine them again so
 * the viewer's toggle wins in both directions.
 */
import { fontFaceCss } from './fonts.mjs';

/** Geometry for the ten-fold star used in ornament — computed, never hand-authored. */
export function starPoints({ points = 10, outer = 22, inner = 9.6, cx = 24, cy = 24 } = {}) {
  const coords = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    coords.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return coords;
}

export function polygonPoints({ points = 10, r = 22, cx = 24, cy = 24, rotate = -Math.PI / 2 } = {}) {
  const coords = [];
  for (let i = 0; i < points; i++) {
    const angle = ((Math.PI * 2) / points) * i + rotate;
    coords.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return coords;
}

const toPath = (coords) => `M${coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L')}Z`;

/** Strapwork band as a data URI — one CSS line per use, no external request. */
export function strapworkDataUri(stroke = '%232E5BC9', opacity = '0.32') {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 48 48'>` +
    `<g fill='none' stroke='${stroke}' stroke-opacity='${opacity}' stroke-width='1'>` +
    `<path d='${toPath(starPoints())}'/>` +
    `<path d='${toPath(polygonPoints())}'/>` +
    `<path d='${toPath(polygonPoints({ points: 5, r: 9.6, rotate: Math.PI / 2 }))}'/>` +
    `<path d='M0,24 L48,24' stroke-opacity='${(Number(opacity) / 2.5).toFixed(2)}'/>` +
    `</g></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/"/g, "'").replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
}

export const CSS = `
${fontFaceCss()}

/* ============================================================================
   Tokens — Safavid Isfahan. Light is the default; dark redefines tokens only.
   ============================================================================ */
:root {
  /* Glazes, straight off the tile */
  --lajvard:      #2E5BC9;   /* cobalt — the dome */
  --lajvard-deep: #1B3C86;
  --firuzeh:      #00A0A0;   /* turquoise — the field */
  --firuzeh-deep: #077F7F;
  --zafaran:      #B77B10;   /* saffron — the highlight */
  --ronas:        #A8321E;   /* madder — the alarm */
  --badenjani:    #8E4BA8;   /* aubergine, used sparingly */

  /* Grounds: ivory plaster and manganese, biased toward the cobalt */
  --gel-1:        #FCFBF7;   /* raised plaster */
  --gel-2:        #F5F2E9;   /* page ground */
  --gel-3:        #EAE5D6;   /* sunken */
  --gel-4:        #DBD4C0;   /* rule */
  --manganese:    #131820;
  --ink:          #1A1F29;
  --ink-2:        #48515F;
  --ink-3:        #6D7686;

  /* Semantic surface roles */
  --bg:           var(--gel-2);
  --bg-raised:    var(--gel-1);
  --bg-sunken:    var(--gel-3);
  --bg-code:      #FDFCF9;
  --rule:         var(--gel-4);
  --rule-strong:  #C6BDA4;
  --text:         var(--ink);
  --text-muted:   var(--ink-2);
  --text-faint:   var(--ink-3);
  --accent:       var(--lajvard);
  --accent-deep:  var(--lajvard-deep);
  --accent-soft:  #E3E9FA;
  --good:         var(--firuzeh);
  --good-soft:    #D8F0EF;
  --warn:         var(--zafaran);
  --warn-soft:    #F7EED8;
  --bad:          var(--ronas);
  --bad-soft:     #F8E3DE;

  /* Sequential ramp for ORDERED dimensions (token tier, package layer).
     Monotonic in OKLCH lightness: 0.767 → 0.553 → 0.379. The lightest step is
     under 3:1 against the surface, so marks using it carry a stroke ring. */
  --seq-1:        #93B4EE;
  --seq-2:        #3D6BD4;
  --seq-3:        #1B3C86;
  --seq-4:        #12295C;
  --seq-1-ring:   #4A77D8;

  /* Type */
  --display: 'Vazirmatn', 'Iowan Old Style', Palatino, Georgia, serif;
  --body:    'Roboto', ui-sans-serif, -apple-system, 'Segoe UI', Arial, sans-serif;
  --util:    'Roboto', ui-sans-serif, -apple-system, 'Segoe UI', Arial, sans-serif;
  --persian: 'Vazirmatn', 'Geeza Pro', 'Tahoma', sans-serif;
  --mono:    ui-monospace, 'SF Mono', SFMono-Regular, 'Cascadia Code', 'JetBrains Mono', Menlo, Consolas, monospace;

  /* Scale — 1.25 from 16.5px */
  --t-xs:   0.75rem;
  --t-sm:   0.8125rem;
  --t-base: 1.03125rem;
  --t-lg:   1.1875rem;
  --t-xl:   1.45rem;
  --t-2xl:  1.85rem;
  --t-3xl:  2.35rem;
  --t-4xl:  3rem;

  --measure: 68ch;
  --sidebar: 16.5rem;
  --radius:  3px;
  --radius-lg: 7px;

  --shadow-1: 0 1px 2px rgba(19, 24, 32, 0.05), 0 1px 6px rgba(19, 24, 32, 0.04);
  --shadow-2: 0 2px 6px rgba(19, 24, 32, 0.07), 0 10px 28px rgba(19, 24, 32, 0.06);

  /* Motion */
  --ease-out:  cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-fast:  140ms;
  --dur-mid:   260ms;
  --dur-slow:  520ms;

  color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg:          var(--manganese);
    --bg-raised:   #1A2130;
    --bg-sunken:   #0E131B;
    --bg-code:     #161D28;
    --rule:        #29323F;
    --rule-strong: #3C4757;
    --text:        #E9E6DC;
    --text-muted:  #ABB3C1;
    --text-faint:  #7B8494;
    --accent:      #6389E4;
    --accent-deep: #A9C5F7;
    --accent-soft: #1B2842;
    --good:        #12A9A1;
    --good-soft:   #0C2F2E;
    --warn:        #C2871F;
    --warn-soft:   #33260E;
    --bad:         #D9604B;
    --bad-soft:    #33150F;
    --seq-1:       #2C4E8E;
    --seq-2:       #5C88E0;
    --seq-3:       #A9C5F7;
    --seq-4:       #D3E1FB;
    --seq-1-ring:  #6C93E8;
    --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.45), 0 1px 6px rgba(0, 0, 0, 0.35);
    --shadow-2: 0 2px 6px rgba(0, 0, 0, 0.5), 0 10px 28px rgba(0, 0, 0, 0.42);
  }
}

:root[data-theme='dark'] {
  --bg:          var(--manganese);
  --bg-raised:   #1A2130;
  --bg-sunken:   #0E131B;
  --bg-code:     #161D28;
  --rule:        #29323F;
  --rule-strong: #3C4757;
  --text:        #E9E6DC;
  --text-muted:  #ABB3C1;
  --text-faint:  #7B8494;
  --accent:      #6389E4;
  --accent-deep: #A9C5F7;
  --accent-soft: #1B2842;
  --good:        #12A9A1;
  --good-soft:   #0C2F2E;
  --warn:        #C2871F;
  --warn-soft:   #33260E;
  --bad:         #D9604B;
  --bad-soft:    #33150F;
  --seq-1:       #2C4E8E;
  --seq-2:       #5C88E0;
  --seq-3:       #A9C5F7;
  --seq-4:       #D3E1FB;
  --seq-1-ring:  #6C93E8;
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.45), 0 1px 6px rgba(0, 0, 0, 0.35);
  --shadow-2: 0 2px 6px rgba(0, 0, 0, 0.5), 0 10px 28px rgba(0, 0, 0, 0.42);
}
:root[data-theme='light'] {
  --bg:          var(--gel-2);
  --bg-raised:   var(--gel-1);
  --bg-sunken:   var(--gel-3);
  --bg-code:     #FDFCF9;
  --rule:        var(--gel-4);
  --rule-strong: #C6BDA4;
  --text:        var(--ink);
  --text-muted:  var(--ink-2);
  --text-faint:  var(--ink-3);
  --accent:      var(--lajvard);
  --accent-deep: var(--lajvard-deep);
  --accent-soft: #E3E9FA;
  --good:        var(--firuzeh);
  --good-soft:   #D8F0EF;
  --warn:        var(--zafaran);
  --warn-soft:   #F7EED8;
  --bad:         var(--ronas);
  --bad-soft:    #F8E3DE;
  --seq-1:       #93B4EE;
  --seq-2:       #3D6BD4;
  --seq-3:       #1B3C86;
  --seq-4:       #12295C;
  --seq-1-ring:  #4A77D8;
  --shadow-1: 0 1px 2px rgba(19, 24, 32, 0.05), 0 1px 6px rgba(19, 24, 32, 0.04);
  --shadow-2: 0 2px 6px rgba(19, 24, 32, 0.07), 0 10px 28px rgba(19, 24, 32, 0.06);
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
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  overflow-wrap: break-word;
}

::selection { background: var(--accent-soft); color: var(--text); }

:where(a) {
  color: var(--accent);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  transition: color var(--dur-fast) var(--ease-out);
}
:where(a):hover { text-decoration-thickness: 2px; color: var(--accent-deep); }

:where(a, button, summary, input, select, [tabindex]):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}

/* Persian runs in Vazirmatn with correct direction. */
[lang='fa'], .persian { font-family: var(--persian); direction: rtl; unicode-bidi: isolate; }

/* ============================================================================
   Frame
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
  gap: 0.65rem;
  margin-bottom: 0.3rem;
  text-decoration: none;
  color: var(--text);
}
.brandmark svg { flex: none; overflow: visible; }
.brandmark .wordmark {
  font-family: var(--display);
  font-size: var(--t-xl);
  font-weight: 600;
  letter-spacing: -0.005em;
  line-height: 1.1;
}
/* Flex gap rather than a margin: the Persian span is RTL, so margin-inline-start
   would land on its right-hand side and close the gap instead of opening it. */
.brandmark .lockup { display: inline-flex; align-items: baseline; gap: 0.45rem; }
.brandmark .persian {
  font-family: var(--persian);
  font-size: var(--t-base);
  color: var(--text-faint);
}
.sidebar .tagline {
  margin: 0 0 1.5rem;
  font-size: var(--t-sm);
  color: var(--text-muted);
  line-height: 1.5;
}

.navgroup { margin-bottom: 1.35rem; }
.navgroup > .label {
  font-size: 0.6875rem;
  font-weight: 700;
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
  padding: 0.34rem 0.5rem;
  border-radius: var(--radius);
  text-decoration: none;
  color: var(--text-muted);
  font-size: var(--t-sm);
  line-height: 1.4;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
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
.bleed { max-width: calc(var(--measure) + 11rem); }

/* ============================================================================
   Page header — generative tessellation canvas behind the title
   ============================================================================ */
.pagehead {
  position: relative;
  border-block-end: 1px solid var(--rule);
  background: var(--bg-sunken);
  padding: 3.5rem 0 2.75rem;
  margin-bottom: 2.5rem;
  overflow: hidden;
  isolation: isolate;
}
.pagehead > canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  /* Fade the pattern out toward the text so it never fights the type. */
  mask-image: linear-gradient(100deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0) 70%);
  -webkit-mask-image: linear-gradient(100deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0) 70%);
}
.pagehead .wrap { position: relative; }
.pagehead .eyebrow {
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 0.65rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.pagehead h1 {
  font-family: var(--display);
  font-size: var(--t-4xl);
  line-height: 1.08;
  letter-spacing: -0.02em;
  margin: 0 0 0.8rem;
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
h2, h3 { font-family: var(--display); text-wrap: balance; letter-spacing: -0.012em; }
h2 {
  font-size: var(--t-2xl);
  line-height: 1.22;
  margin: 3.25rem 0 0.9rem;
  padding-block-start: 1.5rem;
  border-block-start: 1px solid var(--rule);
  font-weight: 600;
}
h2:first-child { margin-top: 0; border-block-start: 0; padding-block-start: 0; }
h3 { font-size: var(--t-xl); line-height: 1.3; margin: 2.25rem 0 0.6rem; font-weight: 600; }
h4 {
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

strong { font-weight: 600; }

code {
  font-family: var(--mono);
  font-size: 0.86em;
  background: var(--bg-sunken);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  padding: 0.08em 0.32em;
  overflow-wrap: break-word;
}
a code { color: inherit; }

hr.strap {
  border: 0;
  height: 56px;
  margin: 3rem 0;
  background-repeat: repeat-x;
  background-position: center;
  opacity: 0.55;
}

/* ============================================================================
   Code blocks — always white-space:pre, always their own scroll container
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
  font-size: var(--t-xs);
  color: var(--text-muted);
}
figure.code > figcaption .path { font-family: var(--mono); font-size: var(--t-xs); }
figure.code > figcaption .badge {
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 0.625rem;
  padding: 0.14rem 0.42rem;
  border-radius: 999px;
  flex: none;
}
.badge.authored  { background: var(--accent-soft); color: var(--accent); }
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
figure.code pre code { background: none; border: 0; padding: 0; font-size: inherit; white-space: pre; }

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
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 0.35rem;
}
.callout > :last-child { margin-bottom: 0; }
.callout.eli5   { border-inline-start-color: var(--good); background: var(--good-soft); }
.callout.eli5 > .title { color: var(--good); }
.callout.rule   { border-inline-start-color: var(--accent); }
.callout.gotcha { border-inline-start-color: var(--warn); background: var(--warn-soft); }
.callout.gotcha > .title { color: var(--warn); }
.callout.danger { border-inline-start-color: var(--bad); background: var(--bad-soft); }
.callout.danger > .title { color: var(--bad); }
.callout.skip   { border-inline-start-color: var(--rule-strong); background: var(--bg-sunken); color: var(--text-muted); }
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
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--text-muted);
}
details.aside[open] > summary { border-block-end: 1px solid var(--rule); margin-block-end: 0.9rem; }
details.aside > :last-child { margin-bottom: 0.9rem; }

/* ============================================================================
   Tables
   ============================================================================ */
.tablewrap { overflow-x: auto; margin: 1.5rem 0; border: 1px solid var(--rule); border-radius: var(--radius-lg); }
table { border-collapse: collapse; width: 100%; font-size: var(--t-sm); }
th, td { text-align: start; padding: 0.55rem 0.75rem; border-block-end: 1px solid var(--rule); vertical-align: top; }
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
tbody tr { transition: background var(--dur-fast) var(--ease-out); }
tbody tr:hover { background: var(--bg-sunken); }
td code { font-size: 0.8125rem; }
.num { font-variant-numeric: tabular-nums; text-align: end; }

/* ============================================================================
   Diagram 1 — tier stack
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
.tier > .name { font-size: var(--t-sm); font-weight: 700; }
.tier > .name .sub { display: block; font-weight: 400; color: var(--text-faint); font-size: var(--t-xs); text-transform: none; }
.tier[data-tier='global']    { border-inline-start: 3px solid var(--seq-1-ring); }
.tier[data-tier='semantic']  { border-inline-start: 3px solid var(--seq-2); }
.tier[data-tier='component'] { border-inline-start: 3px solid var(--seq-3); }
.tier[data-tier='global'] > .name    { color: var(--text-muted); }
.tier[data-tier='semantic'] > .name  { color: var(--seq-2); }
.tier[data-tier='component'] > .name { color: var(--seq-3); }
:root[data-theme='dark'] .tier[data-tier='component'] > .name { color: var(--seq-3); }
.chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.chip {
  font-family: var(--mono);
  font-size: var(--t-xs);
  padding: 0.16rem 0.45rem;
  border-radius: var(--radius);
  border: 1px solid var(--rule);
  background: var(--bg-sunken);
  color: var(--text-muted);
  white-space: nowrap;
  transition: transform var(--dur-fast) var(--ease-out);
}
.chip:hover { transform: translateY(-1px); }
.chip.hot { border-color: var(--warn); background: var(--warn-soft); color: var(--warn); font-weight: 600; }
.chip.lit { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.flowdown {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.15rem 1rem 0.15rem 9.6rem;
  font-size: var(--t-xs);
  color: var(--text-faint);
}
.flowdown::before { content: '↓'; color: var(--accent); font-size: var(--t-lg); line-height: 1; }

/* ============================================================================
   Diagram 2 — pipeline rail
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
  transition: background var(--dur-mid) var(--ease-out), border-color var(--dur-mid) var(--ease-out);
}
.stage + .stage { border-inline-start: 0; }
.stage:first-child { border-start-start-radius: var(--radius-lg); border-end-start-radius: var(--radius-lg); }
.stage:last-child { border-start-end-radius: var(--radius-lg); border-end-end-radius: var(--radius-lg); }
.stage > .n {
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.stage > .t { font-size: var(--t-sm); font-weight: 600; margin: 0.15rem 0 0.3rem; }
.stage > .d { font-size: var(--t-xs); color: var(--text-muted); line-height: 1.45; }
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
   Diagram 3 — package map
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
.pkg .role { display: block; font-family: var(--body); font-size: 0.625rem; color: var(--text-faint); }
.pkg[data-layer='kernel']    { border-color: var(--seq-1-ring); }
.pkg[data-layer='pipeline']  { border-color: var(--seq-2); }
.pkg[data-layer='generator'] { border-color: var(--seq-3); }
.pkg[data-layer='surface']   { border-color: var(--warn); }
.dep { color: var(--text-faint); font-size: var(--t-sm); flex: none; }

/* ============================================================================
   Diagram 4 — var() chain
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
  transition: opacity var(--dur-mid) var(--ease-out), background var(--dur-mid) var(--ease-out),
              transform var(--dur-mid) var(--ease-out);
}
.hop + .hop { border-block-start: 0; }
.hop:first-child { border-start-start-radius: var(--radius-lg); border-start-end-radius: var(--radius-lg); }
.hop:last-child { border-end-start-radius: var(--radius-lg); border-end-end-radius: var(--radius-lg); }
.hop > .tierbadge {
  font-family: var(--body);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.12rem 0.35rem;
  border-radius: 999px;
  text-align: center;
}
.hop[data-tier='global'] > .tierbadge    { background: var(--bg-sunken); color: var(--text-muted); border: 1px solid var(--seq-1-ring); }
.hop[data-tier='semantic'] > .tierbadge  { background: var(--good-soft); color: var(--good); }
.hop[data-tier='component'] > .tierbadge { background: var(--accent-soft); color: var(--accent); }
.hop > .val { text-align: end; color: var(--text-muted); white-space: nowrap; }
.hop[data-override='true'] { background: var(--warn-soft); border-color: var(--warn); }
.hop[data-override='true'] > .val { color: var(--warn); font-weight: 600; }
.hop.dim { opacity: 0.32; }
.hop.pulse { animation: hoppulse var(--dur-slow) var(--ease-out); }
@keyframes hoppulse {
  0%   { background: var(--accent-soft); transform: translateX(-4px); }
  100% { background: var(--bg-raised); transform: translateX(0); }
}
.hop[data-override='true'].pulse { animation: hoppulseover var(--dur-slow) var(--ease-out); }
@keyframes hoppulseover {
  0%   { background: var(--accent-soft); transform: translateX(-4px); }
  100% { background: var(--warn-soft); transform: translateX(0); }
}
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
.widget > header .wt { font-size: var(--t-sm); font-weight: 700; letter-spacing: 0.01em; }
.widget > header .wh { font-size: var(--t-xs); color: var(--text-muted); }
/* A visualization needs more room than the 68ch reading measure. Bleed symmetrically
   out of the prose column rather than forcing a horizontal scroll on the whole page. */
.widget.wide { width: calc(100% + 11rem); margin-inline: -5.5rem; }
.widget > .body { padding: 1rem; }
.widget > .body > :first-child { margin-top: 0; }
.widget > .body > :last-child { margin-bottom: 0; }

.controls { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
button.btn, .seg > button {
  font-family: var(--body);
  font-size: var(--t-sm);
  font-weight: 500;
  padding: 0.42rem 0.8rem;
  border-radius: var(--radius);
  border: 1px solid var(--rule-strong);
  background: var(--bg-raised);
  color: var(--text);
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out),
              background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
button.btn:hover, .seg > button:hover { border-color: var(--accent); color: var(--accent); }
button.btn:active { transform: translateY(1px); }
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

select.sel, input.txt {
  font-family: var(--mono);
  font-size: var(--t-sm);
  padding: 0.4rem 0.5rem;
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
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out),
              transform var(--dur-fast) var(--ease-out);
}
.opts button .k { font-family: var(--mono); font-size: var(--t-xs); font-weight: 700; color: var(--text-faint); flex: none; padding-top: 0.15em; }
.opts button:hover:not([disabled]) { border-color: var(--accent); background: var(--accent-soft); transform: translateX(2px); }
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
.verdict[data-show='true'] { display: block; animation: fadeup var(--dur-mid) var(--ease-out); }
.verdict[data-ok='true'] { background: var(--good-soft); border: 1px solid var(--good); }
.verdict[data-ok='false'] { background: var(--bad-soft); border: 1px solid var(--bad); }
.verdict .vt { font-weight: 700; font-size: var(--t-sm); }
.verdict[data-ok='true'] .vt { color: var(--good); }
.verdict[data-ok='false'] .vt { color: var(--bad); }
.verdict p { margin: 0.3rem 0 0; }
@keyframes fadeup { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.score {
  font-size: var(--t-sm);
  color: var(--text-muted);
  padding: 0.75rem 1rem;
  border: 1px dashed var(--rule-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-sunken);
}
.score b { color: var(--text); font-variant-numeric: tabular-nums; }

/* Live demo surface */
.demosurface {
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  background: var(--bg-sunken);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  transition: background var(--dur-mid) var(--ease-out);
}
.demorow { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
.demolabel {
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-faint);
  min-width: 5.5rem;
}
/* Cross-fade rather than snap when the brand changes. */
.dsdemo .ds-button, .dsdemo .ds-badge, .dsdemo .ds-input, .dsdemo .ds-card {
  transition: background-color var(--dur-mid) var(--ease-out), color var(--dur-mid) var(--ease-out),
              border-color var(--dur-mid) var(--ease-out), border-radius var(--dur-mid) var(--ease-out);
}

/* ============================================================================
   Error-code reference
   ============================================================================ */
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
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.12rem 0.38rem;
  border-radius: 999px;
}
.codecard[data-sev='error'] .sev { background: var(--bad-soft); color: var(--bad); }
.codecard[data-sev='warning'] .sev { background: var(--warn-soft); color: var(--warn); }
.codecard .src { font-family: var(--mono); font-size: var(--t-xs); color: var(--text-faint); margin-inline-start: auto; }
.codecard .msg { font-family: var(--mono); font-size: var(--t-sm); margin: 0.4rem 0 0; white-space: pre-wrap; line-height: 1.55; }
.codecard .help {
  margin: 0.4rem 0 0;
  font-size: calc(var(--t-base) * 0.93);
  color: var(--text-muted);
  padding-inline-start: 0.7rem;
  border-inline-start: 2px solid var(--rule);
}
.ph { color: var(--warn); background: var(--warn-soft); border-radius: 2px; padding: 0 0.15em; font-style: normal; }
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
  font-family: var(--body);
  font-size: var(--t-sm);
  padding: 0.42rem 0.6rem;
  border-radius: var(--radius);
  border: 1px solid var(--rule-strong);
  background: var(--bg-raised);
  color: var(--text);
}
.hidden { display: none !important; }

/* ============================================================================
   Cards, TOC, pager
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
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out),
              transform var(--dur-fast) var(--ease-out);
}
.card:hover { border-color: var(--accent); box-shadow: var(--shadow-2); transform: translateY(-2px); }
.card .n { font-size: var(--t-xs); font-weight: 700; letter-spacing: 0.08em; color: var(--accent); font-variant-numeric: tabular-nums; }
.card .h { font-family: var(--display); font-size: var(--t-lg); font-weight: 600; margin: 0.2rem 0 0.3rem; }
.card .d { font-size: var(--t-sm); color: var(--text-muted); line-height: 1.5; }

.toc {
  margin: 0 0 2.5rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--bg-sunken);
}
.toc > .label {
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-bottom: 0.45rem;
}
.toc ol { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 1.5rem; }
.toc li { margin: 0 0 0.28rem; break-inside: avoid; }
.toc a { font-size: var(--t-sm); text-decoration: none; }
.toc a:hover { text-decoration: underline; }

.pager { display: flex; gap: 0.85rem; margin-top: 3.5rem; padding-top: 1.5rem; border-top: 1px solid var(--rule); }
.pager a {
  flex: 1 1 0;
  padding: 0.85rem 1rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  text-decoration: none;
  background: var(--bg-raised);
  transition: border-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.pager a:hover { border-color: var(--accent); transform: translateY(-2px); }
.pager a .dir { font-size: var(--t-xs); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-faint); }
.pager a .t { display: block; font-family: var(--display); font-size: var(--t-lg); margin-top: 0.15rem; color: var(--text); }
.pager a.next { text-align: end; }

.themetoggle {
  position: fixed;
  inset-block-start: 0.85rem;
  inset-inline-end: 0.85rem;
  z-index: 20;
  font-family: var(--body);
  font-size: var(--t-xs);
  font-weight: 600;
  padding: 0.42rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--rule-strong);
  background: var(--bg-raised);
  color: var(--text-muted);
  cursor: pointer;
  box-shadow: var(--shadow-1);
  transition: color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.themetoggle:hover { color: var(--accent); border-color: var(--accent); }

/* ============================================================================
   Scroll-triggered reveals

   Progressive enhancement, deliberately: a .reveal element is fully VISIBLE by
   default. JavaScript adds .armed only to targets below the fold, and only when
   IntersectionObserver is available — then .shown fades them in. So if the script
   never runs, the observer never fires, or the animation timeline is frozen, the
   content is simply there. Content must never depend on motion to be readable.
   ============================================================================ */
.reveal.armed {
  opacity: 0;
  transform: translateY(14px);
  transition: opacity var(--dur-slow) var(--ease-out), transform var(--dur-slow) var(--ease-out);
  will-change: opacity, transform;
}
.reveal.armed.shown { opacity: 1; transform: none; }

/* Stagger children so a stack arrives in order rather than as one block. */
.reveal.armed .tier, .reveal.armed .hop, .reveal.armed .stage, .reveal.armed .card {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity var(--dur-mid) var(--ease-out), transform var(--dur-mid) var(--ease-out);
}
.reveal.armed.shown .tier, .reveal.armed.shown .hop,
.reveal.armed.shown .stage, .reveal.armed.shown .card {
  opacity: 1;
  transform: none;
}
.reveal.armed.shown .tier:nth-child(2)  { transition-delay: 70ms; }
.reveal.armed.shown .tier:nth-child(3)  { transition-delay: 140ms; }
.reveal.armed.shown .tier:nth-child(4)  { transition-delay: 210ms; }
.reveal.armed.shown .tier:nth-child(5)  { transition-delay: 280ms; }
.reveal.armed.shown .hop:nth-child(2)   { transition-delay: 70ms; }
.reveal.armed.shown .hop:nth-child(3)   { transition-delay: 140ms; }
.reveal.armed.shown .hop:nth-child(4)   { transition-delay: 210ms; }
.reveal.armed.shown .stage:nth-child(2) { transition-delay: 50ms; }
.reveal.armed.shown .stage:nth-child(3) { transition-delay: 100ms; }
.reveal.armed.shown .stage:nth-child(4) { transition-delay: 150ms; }
.reveal.armed.shown .stage:nth-child(5) { transition-delay: 200ms; }
.reveal.armed.shown .stage:nth-child(6) { transition-delay: 250ms; }

/* The flowdown arrow draws itself when its tier stack arrives. */
.reveal.armed .flowdown::before {
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity var(--dur-mid) var(--ease-out) 180ms, transform var(--dur-mid) var(--ease-out) 180ms;
}
.reveal.armed.shown .flowdown::before { opacity: 1; transform: none; }

/* ============================================================================
   Visualizations
   ============================================================================ */
.viz { margin: 0; }
.viz svg { display: block; width: 100%; height: auto; overflow: visible; }
.vizwrap { overflow-x: auto; }

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  align-items: center;
  margin: 0 0 0.75rem;
  font-size: var(--t-xs);
  color: var(--text-muted);
}
.legend .item { display: inline-flex; align-items: center; gap: 0.4rem; }
.legend .key {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 2px;
  flex: none;
  border: 1px solid transparent;
}
.legend .key.ring { border-color: var(--seq-1-ring); }

/* Node-link graph */
.gnode { cursor: pointer; transition: opacity var(--dur-fast) linear; }
.gnode circle { transition: r var(--dur-fast) var(--ease-out), stroke-width var(--dur-fast) var(--ease-out); }
.gnode text {
  font-family: var(--mono);
  font-size: 8.5px;
  fill: var(--text-muted);
  pointer-events: none;
  paint-order: stroke;
  stroke: var(--bg-raised);
  stroke-width: 2.5px;
}
.gedge { stroke: var(--rule-strong); stroke-width: 1; fill: none; transition: stroke var(--dur-fast) linear, stroke-width var(--dur-fast) linear, opacity var(--dur-fast) linear; }
.graph.focused .gnode { opacity: 0.18; }
.graph.focused .gnode.lit { opacity: 1; }
.graph.focused .gedge { opacity: 0.06; }
.graph.focused .gedge.lit { opacity: 1; stroke: var(--accent); stroke-width: 1.75; }
.gnode.lit circle { stroke: var(--accent); stroke-width: 2; }
.gnode.root circle { stroke: var(--warn); stroke-width: 2.5; }

.readout {
  margin-top: 0.75rem;
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--bg-sunken);
  font-size: var(--t-sm);
  min-height: 3.9rem;
}
.readout .rt { font-family: var(--mono); font-weight: 700; color: var(--accent); }
.readout .rd { color: var(--text-muted); margin-top: 0.25rem; display: block; font-size: var(--t-xs); }
.readout ul { margin: 0.35rem 0 0; padding-inline-start: 1.1rem; font-size: var(--t-xs); color: var(--text-muted); }

/* Tile → component morph */
.tilestage { position: relative; }
.tilestage svg { max-width: 100%; }
.tilelabel {
  font-family: var(--body);
  font-size: 9px;
  font-weight: 600;
  fill: var(--text-muted);
  text-anchor: middle;
}
.tileshape { transition: fill var(--dur-slow) var(--ease-out), stroke var(--dur-slow) var(--ease-out), opacity var(--dur-slow) var(--ease-out); }
.strapline { stroke: var(--warn); stroke-width: 1.2; fill: none; opacity: 0; transition: opacity var(--dur-slow) var(--ease-out); }
.tilestage[data-phase='edges'] .strapline,
.tilestage[data-phase='map'] .strapline { opacity: 1; }

/* Cascade visualizer */
.cascade { display: grid; gap: 0.6rem; }
.scope {
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  padding: 0.75rem 0.9rem;
  background: var(--bg-raised);
  position: relative;
}
.scope > .sel {
  font-family: var(--mono);
  font-size: var(--t-xs);
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 0.4rem;
}
.scope .decls { display: flex; flex-direction: column; gap: 0.15rem; font-family: var(--mono); font-size: var(--t-xs); }
.scope .decl { display: flex; justify-content: space-between; gap: 0.75rem; padding: 0.12rem 0.3rem; border-radius: 2px; }
.scope .decl.wins { background: var(--good-soft); color: var(--good); font-weight: 600; }
.scope .decl.shadowed { color: var(--text-faint); text-decoration: line-through; }
.scope .decl.missing { color: var(--warn); font-style: italic; }
.scope[data-active='true'] { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.cascade .nested { margin-inline-start: 1.25rem; }
.resultbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--rule-strong);
  background: var(--bg-sunken);
  font-family: var(--mono);
  font-size: var(--t-sm);
}
.resultbar .big { font-size: var(--t-xl); font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
.resultbar .verdicttext { font-family: var(--body); font-size: var(--t-xs); color: var(--text-muted); }
.previewbox {
  width: 4.5rem;
  height: 2.4rem;
  border: 2px solid var(--accent);
  background: var(--accent-soft);
  transition: border-radius var(--dur-mid) var(--ease-out), background var(--dur-mid) var(--ease-out);
  flex: none;
}

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
  .cascade .nested { margin-inline-start: 0.6rem; }
  /* No room to bleed on a phone. */
  .widget.wide { width: 100%; margin-inline: 0; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  /* Revealed content must be visible, not stuck mid-animation. */
  .reveal, .reveal.armed, .reveal .tier, .reveal .hop, .reveal .stage, .reveal .card,
  .reveal .flowdown::before {
    opacity: 1 !important;
    transform: none !important;
  }
  .pagehead > canvas { display: none; }
}

@media print {
  .sidebar, .themetoggle, .pager, .filterbar { display: none; }
  .frame { grid-template-columns: 1fr; }
  body { background: #fff; color: #000; }
  .pagehead > canvas { display: none; }
  .reveal, .reveal.armed { opacity: 1 !important; transform: none !important; }
}
`;
