#!/usr/bin/env node
/**
 * Generate every icon and brand asset from the geometry in lib/icon.mjs.
 *
 * Writes SVG directly, then rasterizes PNG with headless Chrome — the one renderer we
 * can rely on being present, and the same engine that will display the result. No
 * ImageMagick, rsvg or Inkscape dependency.
 *
 * favicon.ico is assembled by hand: an ICO is a 6-byte header plus a 16-byte directory
 * entry per image plus the embedded PNGs, and every browser that still asks for
 * /favicon.ico accepts PNG payloads. That is far less machinery than adding a converter.
 *
 * Usage:
 *   node docs/scripts/build-icons.mjs
 *   node docs/scripts/build-icons.mjs --site-url https://owner.github.io/girih
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

import { tileIcon, logomark, lockup, socialCard, BRAND } from './lib/icon.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const docsDir = join(repoRoot, 'docs');
const brandDir = join(docsDir, 'brand');
const iconsDir = join(docsDir, 'icons');

const siteFlag = process.argv.indexOf('--site-url');
const siteUrl = siteFlag !== -1 ? (process.argv[siteFlag + 1] ?? '').replace(/\/$/, '') : '';

/* ------------------------------------------------------------------ chrome */

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  process.env.CHROME_PATH ?? '',
].filter(Boolean);

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('No Chrome/Chromium found for rasterizing. Set CHROME_PATH, or install one.');
  console.error('Tried:\n  ' + CHROME_CANDIDATES.join('\n  '));
  process.exit(1);
}

const scratch = join(tmpdir(), `girih-icons-${process.pid}`);
mkdirSync(scratch, { recursive: true });

/**
 * Rasterize an SVG string to PNG at an exact pixel size.
 *
 * The SVG goes into an HTML wrapper with zero margin and an explicitly sized box, which
 * is far more predictable than letting Chrome infer a viewport from the SVG's own
 * width/height. `--default-background-color=00000000` keeps transparency where wanted.
 */
function rasterize(svg, { width, height, out, transparent = false }) {
  const htmlPath = join(scratch, `${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(
    htmlPath,
    `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;background:${transparent ? 'transparent' : 'none'};}
      svg{display:block;width:${width}px;height:${height}px;}
    </style></head><body>${svg}</body></html>`,
    'utf8',
  );

  const args = [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--allow-file-access-from-files',
    `--screenshot=${out}`,
    `--window-size=${width},${height}`,
    '--virtual-time-budget=3000',
  ];
  if (transparent) args.push('--default-background-color=00000000');
  args.push(`file://${htmlPath}`);

  const res = spawnSync(chrome, args, { encoding: 'utf8' });
  if (!existsSync(out)) {
    console.error(`Failed to rasterize ${relative(repoRoot, out)}`);
    console.error(res.stderr?.split('\n').slice(0, 6).join('\n'));
    process.exit(1);
  }
  return out;
}

/* --------------------------------------------------------------------- ico */

/**
 * Build a multi-size .ico from PNG buffers.
 *
 * Layout: ICONDIR (6 bytes) + one 16-byte ICONDIRENTRY per image + the PNG payloads.
 * A dimension of 256 is encoded as 0, which is why the byte is written modulo 256.
 */
function buildIco(pngPaths) {
  const images = pngPaths.map((p) => {
    const data = readFileSync(p);
    // PNG IHDR carries the real dimensions at a fixed offset — trust the file, not the
    // filename, so a mis-sized render is caught here rather than shipped.
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    return { data, width, height };
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;
  for (const img of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(img.width % 256, 0);
    e.writeUInt8(img.height % 256, 1);
    e.writeUInt8(0, 2); // palette size — 0 for truecolour
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(img.data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += img.data.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

/* ------------------------------------------------------------------- build */

mkdirSync(brandDir, { recursive: true });
mkdirSync(iconsDir, { recursive: true });

const written = [];
const write = (path, contents) => {
  writeFileSync(path, contents);
  written.push(path);
  return path;
};

console.log('Icons');

// --- the scalable favicon: one file, every size ------------------------------
const faviconSvg = tileIcon({ box: 64, id: 'fav' });
write(join(docsDir, 'favicon.svg'), faviconSvg);

// --- raster icons -----------------------------------------------------------
// 16/32/48 for the .ico, 180 for iOS, 192/512 for the manifest, plus a maskable
// variant whose art sits inside Android's safe circle.
const rasterSizes = [16, 32, 48, 64, 180, 192, 512];
const rasterPaths = {};
for (const size of rasterSizes) {
  const out = join(iconsDir, `icon-${size}.png`);
  rasterize(tileIcon({ box: 64, id: `s${size}` }), { width: size, height: size, out });
  rasterPaths[size] = out;
  written.push(out);
  console.log(`  icon-${size}.png`);
}

// Apple wants a name it recognises and no transparency; ours has a solid tile anyway.
write(join(docsDir, 'apple-touch-icon.png'), readFileSync(rasterPaths[180]));

const maskableOut = join(iconsDir, 'maskable-512.png');
rasterize(tileIcon({ box: 64, id: 'mask', maskable: true, rounded: 0 }), {
  width: 512,
  height: 512,
  out: maskableOut,
});
written.push(maskableOut);
console.log('  maskable-512.png');

// --- favicon.ico ------------------------------------------------------------
write(join(docsDir, 'favicon.ico'), buildIco([rasterPaths[16], rasterPaths[32], rasterPaths[48]]));
console.log('  favicon.ico (16+32+48)');

/* ------------------------------------------------------------------- brand */

console.log('Brand assets');

// Outline mark, transparent, inherits colour from context — the asset to reach for.
write(join(brandDir, 'logomark.svg'), logomark({ box: 64 }));
const markPng = join(brandDir, 'logomark.png');
rasterize(`<div style="color:${BRAND.ink}">${logomark({ box: 64 })}</div>`, {
  width: 256,
  height: 256,
  out: markPng,
  transparent: true,
});
written.push(markPng);

// The solid tile, as an asset in its own right.
write(join(brandDir, 'tile.svg'), tileIcon({ box: 64, id: 'tile' }));

// Lockups. The shipped SVG only NAMES the typefaces — embedding them would put 80kb of
// font in a logo file. The PNG beside it is rendered with the real faces, for anyone who
// just wants a picture (the README, a slide, a README badge).
// Read the intrinsic size out of the artwork rather than restating it here.
const lockupProbe = lockup({ theme: 'light' });
const LOCKUP_W = Number(/viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(lockupProbe)[1]);
const LOCKUP_H = Number(/viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(lockupProbe)[2]);

for (const theme of ['light', 'dark']) {
  write(join(brandDir, `lockup-${theme}.svg`), lockup({ theme, embedFont: false }));
  const out = join(brandDir, `lockup-${theme}.png`);
  // Must match the lockup's own viewBox or the raster squashes it.
  rasterize(lockup({ theme, embedFont: true }), {
    width: LOCKUP_W,
    height: LOCKUP_H,
    out,
    transparent: true,
  });
  written.push(out);
  console.log(`  lockup-${theme}.svg + .png`);
}

/* ------------------------------------------------------------ social cards */

console.log('Social cards');

const ogOut = join(docsDir, 'og-card.png');
rasterize(socialCard({ w: 1200, h: 630, variant: 'og' }), { width: 1200, height: 630, out: ogOut });
written.push(ogOut);
console.log('  og-card.png (1200x630)');

const ghOut = join(brandDir, 'github-social-preview.png');
rasterize(socialCard({ w: 1280, h: 640, variant: 'github' }), { width: 1280, height: 640, out: ghOut });
written.push(ghOut);
console.log('  github-social-preview.png (1280x640)');

/* --------------------------------------------------------------- manifest */

const manifest = {
  name: 'girih — design system infrastructure',
  short_name: 'girih',
  description:
    'Compile multi-brand design systems from DTCG tokens and component contracts. One warp, many wefts.',
  start_url: './index.html',
  scope: './',
  display: 'standalone',
  // The manganese ground the icon sits on, so the splash matches the tile.
  background_color: BRAND.manganese,
  theme_color: BRAND.manganese,
  lang: 'en',
  dir: 'ltr',
  categories: ['developer', 'productivity'],
  icons: [
    { src: './favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: './icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
write(join(docsDir, 'site.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Manifest\n  site.webmanifest');

/* ------------------------------------------------------------------ usage */

write(
  join(brandDir, 'README.md'),
  `<!-- Generated by docs/scripts/build-icons.mjs -->

# girih brand assets

Everything here is generated from one ten-fold construction in
[\`docs/scripts/lib/icon.mjs\`](../scripts/lib/icon.mjs). Do not edit these files — change the
geometry and re-run:

\`\`\`bash
node docs/scripts/build-icons.mjs
\`\`\`

| File | Use |
| --- | --- |
| [\`logomark.svg\`](logomark.svg) | The outline mark. Transparent, strokes use \`currentColor\`, so it inherits the surrounding text colour. Reach for this first. |
| [\`logomark.png\`](logomark.png) | 256px raster of the same, in ink. For places that will not render SVG. |
| [\`tile.svg\`](tile.svg) | The solid star on its glazed tile — the icon artwork, as an asset. |
| [\`lockup-light.svg\`](lockup-light.svg) · [\`lockup-dark.svg\`](lockup-dark.svg) | Mark + \`girih\` + \`گره\`. These name Vazirmatn rather than embedding it, so install the font or use the PNG. |
| [\`lockup-light.png\`](lockup-light.png) · [\`lockup-dark.png\`](lockup-dark.png) | The lockups rendered with the real typefaces. |
| [\`github-social-preview.png\`](github-social-preview.png) | 1280×640, for Settings → General → Social preview. |

The Open Graph card lives at [\`../og-card.png\`](../og-card.png) because it is referenced by the
pages themselves.

## The two marks, and when to use which

The **outline mark** shows its own construction — circle, ten radii, decagon, slender star. It is
the identity at any size a reader can actually look at.

The **tile** is a different drawing of the same geometry: one solid star, thicker notches, on a
glazed ground. It exists because four overlapping hairlines average out to a grey blob at 16px.
Use the tile wherever the mark must survive being small — favicons, app icons, avatars.

## Colour

| Token | Hex | Where it comes from |
| --- | --- | --- |
| lājvard (cobalt) | \`${BRAND.lajvard}\` | the dome |
| fīrūzeh (turquoise) | \`${BRAND.firuzeh}\` | the tiled field |
| zafarān (saffron) | \`${BRAND.zafaran}\` | highlight, and warnings |
| manganese | \`${BRAND.manganese}\` | the dark outline between glazed fields |
| plaster | \`${BRAND.plaster}\` | ivory ground |

The star runs cobalt → turquoise on the tile. Everywhere else, flat cobalt.

## Please do not

- Recolour the star to something outside the palette above.
- Rotate the mark. Ten-fold symmetry has a point-up orientation; turning it reads as an error.
- Stretch either mark non-uniformly, or add a drop shadow.
- Use the outline mark below about 24px — that is what the tile is for.
`,
);
written.push(join(brandDir, 'README.md'));

/* ------------------------------------------------------------------ report */

rmSync(scratch, { recursive: true, force: true });

console.log(`\nWrote ${written.length} files.`);
if (siteUrl) {
  console.log(`Absolute URLs will use ${siteUrl}`);
} else {
  console.log(
    'Note: og:image is emitted relative. Most scrapers require an absolute URL — rebuild with\n' +
      '  node docs/scripts/build-icons.mjs --site-url https://<owner>.github.io/<repo>\n' +
      'and re-run build-docs.mjs, once GitHub Pages is enabled.',
  );
}

// Record the site URL so build-docs can emit absolute og: tags without being told twice.
write(
  join(docsDir, 'data/site.json'),
  JSON.stringify({ siteUrl, generatedBy: 'docs/scripts/build-icons.mjs' }, null, 2) + '\n',
);
