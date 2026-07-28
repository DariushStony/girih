/**
 * Normalise CLI output before asserting on it.
 *
 * Two things vary by environment and neither is a girih behaviour worth testing:
 *
 *   Colour. picocolors turns colour on whenever CI is set, so an assertion spanning a
 *   coloured run — `1 component contract`, whose count is bold — passes locally and
 *   fails in CI, with a diff showing two identical-looking strings.
 *
 *   Path separators. The CLI prints `join()`ed paths, so `src/button.tsx` arrives as
 *   `src\button.tsx` on Windows.
 *
 * Both are correct output. Tests assert on the text, so they normalise first.
 */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

export function plainOutput(text: string): string {
  return text.replace(ANSI, '').replaceAll('\\', '/');
}
