import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Where is `name` installed, looking up from `dir`? Mirrors Node's own upward walk
 * rather than using createRequire, because many packages do not export
 * './package.json' and resolving their entry point would execute them.
 *
 * One implementation shared by the build preflight, `doctor`, and the config loader's
 * "is the CLI reachable?" check — three copies of a resolution rule is how they drift.
 */
export function resolvePackageDir(dir: string, name: string): string | null {
  for (let current = dir; ; current = dirname(current)) {
    const candidate = join(current, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (current === dirname(current)) return null;
  }
}

export function resolvesFrom(dir: string, name: string): boolean {
  return resolvePackageDir(dir, name) !== null;
}

/** Installed version of `name` as seen from `dir`, or null if it is not installed. */
export function installedVersion(dir: string, name: string): string | null {
  const packageDir = resolvePackageDir(dir, name);
  if (!packageDir) return null;
  try {
    const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as { version?: string };
    return manifest.version ?? null;
  } catch {
    return null;
  }
}
