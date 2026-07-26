/**
 * Every piece of brand artwork, generated from one ten-fold construction.
 *
 * The sidebar logo shows its own construction — circle, radii, decagon, thin star. That
 * is right at 34px and wrong at 16px, where four overlapping hairlines average out to a
 * grey blob. So the ICON is a different drawing of the same geometry: one solid star on
 * a glazed tile, which is how the motif actually appears on a wall in Isfahan.
 *
 * Nothing here is hand-authored path data. Change `POINTS` or `INNER_RATIO` and every
 * icon, the maskable variant, and both social cards follow.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* ---------------------------------------------------------------- geometry */

const POINTS = 10;

/**
 * How deep the notches between points cut. The mathematically pure {10/3} star polygon
 * uses cos(3π/10)/cos(π/10) ≈ 0.618, which is beautiful and far too slender to survive
 * a 16px favicon — the points thin to less than a pixel. 0.70 keeps the ten-fold
 * character while leaving every point at least two pixels wide at 16px.
 */
const INNER_RATIO = 0.7;

/** The pure ratio, kept for the large outline mark where slenderness is an asset. */
export const PURE_INNER_RATIO = Math.cos((3 * Math.PI) / 10) / Math.cos(Math.PI / 10);

function starPoints(R, cx, cy, innerRatio = INNER_RATIO, rotate = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < POINTS * 2; i++) {
    const r = i % 2 === 0 ? R : R * innerRatio;
    const a = (Math.PI / POINTS) * i + rotate;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function polyPoints(R, cx, cy, n = POINTS, rotate = -Math.PI / 2) {
  return Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 / n) * i + rotate;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  });
}

const fmt = (pts) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

/* ---------------------------------------------------------------- palette */

export const BRAND = {
  lajvard: '#2E5BC9',
  lajvardDeep: '#1B3C86',
  firuzeh: '#00A0A0',
  firuzehBright: '#14B3B3',
  zafaran: '#B77B10',
  manganese: '#131820',
  plaster: '#F5F2E9',
  plasterRaised: '#FCFBF7',
  ink: '#1A1F29',
  inkMuted: '#48515F',
};

/* ---------------------------------------------------------------- the icon */

/**
 * The tile icon: a solid ten-pointed star on a rounded tile.
 *
 * @param {object} opts
 *   box        viewBox extent (square)
 *   starScale  star circumradius as a fraction of half the box
 *   rounded    corner radius as a fraction of the box; 0 for a full-bleed square
 *   maskable   true → shrink the art into the inner 80% so Android's mask cannot clip it
 *   ground     tile fill; null for transparent
 *   id         gradient id, must be unique per document if several are inlined
 */
export function tileIcon({
  box = 64,
  starScale = 0.78,
  rounded = 0.1875,
  maskable = false,
  ground = BRAND.manganese,
  id = 'g',
} = {}) {
  const c = box / 2;
  // A maskable icon must survive being cropped to a circle of 80% of the canvas, so the
  // art lives inside that circle rather than filling the square.
  const scale = maskable ? starScale * 0.72 : starScale;
  const R = c * scale;

  const star = fmt(starPoints(R, c, c));
  // A faint decagon under the star reads as the tile's own cut edge at larger sizes and
  // simply disappears at favicon sizes, which is exactly what it should do.
  const deca = fmt(polyPoints(R * 1.16, c, c));
  const rx = rounded > 0 ? (box * rounded).toFixed(2) : 0;

  const groundLayer = ground
    ? `<rect width="${box}" height="${box}" rx="${rx}" fill="${ground}"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${box}" height="${box}" role="img" aria-label="girih">
  <defs>
    <linearGradient id="star-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND.lajvard}"/>
      <stop offset="1" stop-color="${BRAND.firuzehBright}"/>
    </linearGradient>
  </defs>
  ${groundLayer}
  <polygon points="${deca}" fill="none" stroke="${BRAND.lajvard}" stroke-opacity="0.34" stroke-width="${(box / 64).toFixed(2)}"/>
  <polygon points="${star}" fill="url(#star-${id})"/>
</svg>
`;
}

/**
 * The outline mark, for brand use on any background: the full construction at the pure
 * {10/3} ratio, transparent, with `currentColor` so it inherits wherever it is placed.
 */
export function logomark({ box = 64, accent = BRAND.lajvard, showConstruction = true } = {}) {
  const c = box / 2;
  const R = c * 0.84;
  const star = fmt(starPoints(R, c, c, PURE_INNER_RATIO));
  const deca = fmt(polyPoints(R, c, c));
  const sw = (box / 64) * 1.6;

  const construction = showConstruction
    ? `<g stroke="currentColor" stroke-opacity="0.3" stroke-width="${(sw * 0.4).toFixed(2)}" fill="none">
    <circle cx="${c}" cy="${c}" r="${R.toFixed(2)}"/>
    ${polyPoints(R, c, c)
      .map(([x, y]) => `<line x1="${c}" y1="${c}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}"/>`)
      .join('\n    ')}
  </g>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${box}" height="${box}" fill="none" role="img" aria-label="girih">
  ${construction}
  <polygon points="${deca}" fill="none" stroke="currentColor" stroke-opacity="0.42" stroke-width="${(sw * 0.55).toFixed(2)}"/>
  <polygon points="${star}" fill="none" stroke="${accent}" stroke-width="${sw.toFixed(2)}" stroke-linejoin="round"/>
</svg>
`;
}

/* ---------------------------------------------------------------- typography */

const fontsPath = fileURLToPath(new URL('../../data/fonts.json', import.meta.url));
let fontsCache = null;

/**
 * @font-face blocks for artwork that carries text. Only needed for images we rasterize
 * ourselves — a shipped SVG names the family and lets the viewer's system resolve it.
 */
export function embeddedFontCss(subsets = ['latin', 'arabic']) {
  if (!existsSync(fontsPath)) return '';
  fontsCache ??= JSON.parse(readFileSync(fontsPath, 'utf8'));
  const faces = [];
  for (const [family, info] of Object.entries(fontsCache.families)) {
    for (const face of info.faces) {
      if (!subsets.includes(face.subset)) continue;
      faces.push(`@font-face{font-family:'${family}';font-weight:${face.weightRange};font-style:normal;src:url(${face.dataUri}) format('woff2');${face.unicodeRange ? `unicode-range:${face.unicodeRange};` : ''}}`);
    }
  }
  return faces.join('');
}

/* ---------------------------------------------------------------- lockup */

/**
 * The horizontal lockup: mark, "girih", and گره.
 *
 * @param opts.embedFont  inline the typefaces (for our own rasterizing) or merely name
 *                        them (for a shipped SVG, which should not carry 80kb of font)
 */
export function lockup({ theme = 'light', embedFont = false, width = 470 } = {}) {
  const dark = theme === 'dark';
  const ink = dark ? '#E9E6DC' : BRAND.ink;
  const muted = dark ? '#7B8494' : BRAND.inkMuted;
  const markSize = 76;
  const H = 110;
  const style = `<style>${embedFont ? embeddedFontCss() : ''}
    .wm{font-family:'Vazirmatn',Palatino,Georgia,serif;font-weight:600;font-size:58px;fill:${ink}}
    .fa{font-family:'Vazirmatn',sans-serif;font-weight:500;font-size:34px;fill:${muted}}
  </style>`;

  const markInner = logomark({ box: markSize, accent: dark ? '#6389E4' : BRAND.lajvard })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${H}" width="${width}" height="${H}" role="img" aria-label="girih گره">
  ${style}
  <g transform="translate(4, ${(H - markSize) / 2})" color="${ink}">${markInner}</g>
  <text class="wm" x="${markSize + 20}" y="${H / 2 + 20}">girih</text>
  <!-- "girih" sets ~145px at 58px/600; clear it with room to spare rather than
       guessing tightly, since SVG offers no text measurement at build time. -->
  <text class="fa" x="${markSize + 196}" y="${H / 2 + 16}" text-anchor="start" direction="rtl">گره</text>
</svg>
`;
}

/* ---------------------------------------------------------------- social cards */

/**
 * A social card. Two crops are needed because Open Graph wants 1200×630 and GitHub's
 * repo card is 1280×640 — close, but a shared render would letterbox on one of them.
 *
 * The background is the real girih tessellation, drawn with the same construction the
 * page headers use: decagons on a staggered lattice, strapwork joining edge midpoints.
 */
export function socialCard({ w = 1200, h = 630, variant = 'og' } = {}) {
  const tiles = [];
  const R = 92;
  const stepX = R * 2 * Math.cos(Math.PI / 10);
  const stepY = R * (1 + Math.cos(Math.PI / 5));
  for (let row = -1; row * stepY < h + stepY; row++) {
    for (let col = -1; col * stepX < w + stepX; col++) {
      const x = col * stepX + (row % 2 === 0 ? 0 : stepX / 2);
      const y = row * stepY;
      const pts = polyPoints(R, x, y);
      const outline = fmt(pts);
      // Strapwork. Joining ADJACENT edge midpoints would just draw a smaller decagon —
      // the girih star comes from joining midpoint i to midpoint i+3, which traces a
      // {10/3} decagram. Those are the lines that continue unbroken across tile edges,
      // because every tile places its midpoints identically.
      const mids = pts.map((p, i) => {
        const q = pts[(i + 1) % pts.length];
        return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      });
      const order = [];
      for (let i = 0, at = 0; i < 10; i++, at = (at + 3) % 10) order.push(mids[at]);
      const strap = fmt(order);
      const inner = fmt(
        mids.map(([mx, my]) => [mx + (x - mx) * 0.42, my + (y - my) * 0.42]),
      );
      tiles.push(
        `<polygon points="${outline}" fill="none" stroke="${BRAND.plaster}" stroke-opacity="0.07" stroke-width="1"/>` +
          `<polygon points="${strap}" fill="none" stroke="${BRAND.lajvard}" stroke-opacity="0.30" stroke-width="1.4"/>` +
          `<polygon points="${inner}" fill="none" stroke="${BRAND.firuzeh}" stroke-opacity="0.26" stroke-width="1.2"/>`,
      );
    }
  }

  const markSize = variant === 'github' ? 132 : 124;
  const markInner = tileIcon({ box: markSize, id: 'card', rounded: 0.2 })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');

  const padX = variant === 'github' ? 88 : 80;
  const baseY = variant === 'github' ? h / 2 - 96 : h / 2 - 92;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <style>${embeddedFontCss()}
    .t{font-family:'Vazirmatn',Palatino,Georgia,serif;font-weight:600;fill:#F2EFE6}
    .b{font-family:'Roboto',sans-serif;font-weight:400;fill:#ABB3C1}
    .k{font-family:'Roboto',sans-serif;font-weight:500;fill:#6389E4;letter-spacing:0.14em;text-transform:uppercase}
    .fa{font-family:'Vazirmatn',sans-serif;font-weight:500;fill:#7B8494}
  </style>
  <rect width="${w}" height="${h}" fill="${BRAND.manganese}"/>
  <g>${tiles.join('')}</g>
  <!-- Fade the pattern away from the text so the type never fights the ornament. -->
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0.35">
      <stop offset="0" stop-color="${BRAND.manganese}" stop-opacity="0.97"/>
      <stop offset="0.62" stop-color="${BRAND.manganese}" stop-opacity="0.80"/>
      <stop offset="1" stop-color="${BRAND.manganese}" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#scrim)"/>

  <g transform="translate(${padX}, ${baseY})">${markInner}</g>
  <text class="t" x="${padX}" y="${baseY + markSize + 84}" font-size="${variant === 'github' ? 92 : 86}">girih</text>
  <!-- 'girih' sets about 2.5em wide at this weight; clear it generously rather than
       guessing, since SVG gives us no way to measure at build time. -->
  <text class="fa" x="${padX + (variant === 'github' ? 268 : 250)}" y="${baseY + markSize + 76}" font-size="44" text-anchor="start" direction="rtl">گره</text>
  <text class="k" x="${padX}" y="${baseY + markSize + 132}" font-size="21">design system infrastructure</text>
  <text class="b" x="${padX}" y="${baseY + markSize + 186}" font-size="31">One warp, many wefts — compile multi-brand design</text>
  <text class="b" x="${padX}" y="${baseY + markSize + 228}" font-size="31">systems from tokens and component contracts.</text>
</svg>
`;
}
