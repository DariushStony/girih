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

/**
 * Every test in these suites spawns the CLI as a real process, often several times. A CI
 * runner is far slower at that than a dev machine — the eject test measured 2.5s locally
 * and 5.13s on Windows, just over vitest's 5s default — so the suite gets a timeout that
 * reflects what it actually does. Unit tests keep the strict default: a hang there is a
 * bug, not a slow machine. Per-test timeouts still override this.
 */
export const SUITE_TIMEOUT = 30_000;

/** The strict tsconfig a generated package must typecheck cleanly under — what a consumer's own strict project would use. */
export const STRICT_TSCONFIG = {
  compilerOptions: {
    strict: true,
    noEmit: true,
    jsx: 'react-jsx',
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    lib: ['ES2022', 'DOM'],
    skipLibCheck: true,
  },
  include: ['src'],
};
