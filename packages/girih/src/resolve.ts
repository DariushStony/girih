import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Where is `name` installed, looking up from `dir`? Mirrors Node's own upward walk
 * rather than using createRequire, because many packages do not export
 * './package.json' and resolving their entry point would execute them.
 *
 * Returns the realpath, not the candidate path, because pnpm's isolated node_modules
 * installs every package as a symlink into its own private store entry — a caller
 * that keeps walking upward from the symlink path (rather than its target) to resolve
 * that package's own dependencies would just re-walk the requester's ancestry and
 * never reach the store, matching Node's own default (non-`--preserve-symlinks`)
 * resolution behavior.
 *
 * One implementation shared by the build preflight, `doctor`, and the config loader's
 * "is the CLI reachable?" check — three copies of a resolution rule is how they drift.
 */
export function resolvePackageDir(dir: string, name: string): string | null {
  for (let current = dir; ; current = dirname(current)) {
    const candidate = join(current, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
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
