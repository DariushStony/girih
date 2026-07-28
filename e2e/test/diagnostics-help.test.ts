import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every `GIRIH` diagnostic must carry a `help` line.
 *
 * CONTRIBUTING promises one for anything actionable, and for a long time roughly half of
 * them had none — a documented gap that stayed a gap because nothing failed when a new
 * diagnostic shipped without one. This is that missing check. It asserts the *presence* of
 * help, never its wording, so the text stays free to improve.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * The object literal enclosing `index`: walk back to its unmatched `{`, then forward to the
 * match. Counting braces from the `code:` line instead would drive the depth negative at the
 * first `}` and report almost every diagnostic as help-less.
 */
function enclosingObject(src: string, index: number): string | null {
  let depth = 0;
  let start = -1;
  for (let i = index; i >= 0; i--) {
    const c = src[i];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }
  if (start < 0) return null;
  depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

interface Site {
  code: string;
  file: string;
  line: number;
  hasHelp: boolean;
}

function diagnosticSites(): Site[] {
  const files = globSync('packages/*/src/**/*.ts', { cwd: repoRoot });
  const sites: Site[] = [];
  for (const rel of files) {
    const src = readFileSync(`${repoRoot}/${rel}`, 'utf8');
    const re = /code:\s*'(GIRIH\d+)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const obj = enclosingObject(src, m.index);
      // `help` is usually a field; GIRIH1002 assigns it afterwards so the missing-install
      // case can override the default.
      const assignedAfter = /\.help\s*=/.test(src.slice(m.index, m.index + (obj?.length ?? 0) + 400));
      sites.push({
        code: m[1]!,
        file: rel,
        line: src.slice(0, m.index).split('\n').length,
        hasHelp: (obj !== null && /(^|[\s{,])help:/.test(obj)) || assignedAfter,
      });
    }
  }
  return sites;
}

describe('diagnostics', () => {
  const sites = diagnosticSites();

  it('finds every diagnostic site', () => {
    // A guard on the guard: if the scan silently stopped matching, the help assertion below
    // would pass vacuously.
    expect(sites.length).toBeGreaterThan(70);
  });

  it('gives every GIRIH code a help line', () => {
    const without = sites.filter((s) => !s.hasHelp).map((s) => `${s.code} at ${s.file}:${s.line}`);
    expect(without, 'a diagnostic without help leaves the user with a code and no way forward').toEqual([]);
  });
});
