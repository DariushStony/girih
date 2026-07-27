/**
 * Emit @font-face rules with the fonts inlined as base64 data URIs.
 *
 * Roboto carries body text, UI labels, tables and captions. Vazirmatn — an
 * Iranian-designed family with a genuinely good Latin companion — carries display
 * headings AND all Persian, so one hand spans both scripts. Both are variable, so a
 * single file per subset covers the whole 400–700 range.
 *
 * `unicode-range` matters here: the browser downloads nothing extra because the file
 * is already inline, but it still lets the Arabic face win for Persian codepoints and
 * the Latin face win for everything else, without the author having to switch families
 * by hand around a Persian word.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fontsPath = fileURLToPath(new URL('../../data/fonts.json', import.meta.url));

let fonts = null;
if (existsSync(fontsPath)) {
  fonts = JSON.parse(readFileSync(fontsPath, 'utf8'));
}

export const FONTS_AVAILABLE = fonts !== null;

/** Total inlined weight, for the build report. */
export function fontBytes() {
  if (!fonts) return 0;
  return Object.values(fonts.families)
    .flatMap((f) => f.faces)
    .reduce((sum, face) => sum + face.dataUri.length, 0);
}

export function fontFaceCss() {
  if (!fonts) {
    return `/* docs/data/fonts.json missing — run: node docs/scripts/fetch-fonts.mjs
   Falling back to system stacks. */\n`;
  }

  const blocks = [];
  for (const [family, info] of Object.entries(fonts.families)) {
    for (const face of info.faces) {
      blocks.push(`@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${face.weightRange};
  font-display: swap;
  src: url(${face.dataUri}) format('woff2');${face.unicodeRange ? `\n  unicode-range: ${face.unicodeRange};` : ''}
}`);
    }
  }
  return blocks.join('\n');
}
