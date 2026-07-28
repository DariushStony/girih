import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type PackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun';

/** Lockfile → manager, in the order they are probed. */
const LOCKFILES: readonly (readonly [string, PackageManagerName])[] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
];

/**
 * Which package manager this workspace uses.
 *
 * The lockfile wins, then `packageManager` in package.json, then the user agent. That order
 * is deliberate and was the wrong way round before: the user agent says how *girih* was
 * invoked, not what the workspace is managed by, so `pnpm exec girih check` in an
 * npm-managed workspace reported pnpm and told the user to run `pnpm add`. It is also
 * absent entirely when the binary is called directly — which is how most people run a CLI.
 *
 * Only ever used to phrase advice. Nothing here spawns a package manager, so a wrong guess
 * costs a misleading sentence, never a mangled install.
 */
export function detectPackageManager(root: string = process.cwd()): PackageManagerName {
  for (const [file, manager] of LOCKFILES) {
    if (existsSync(join(root, file))) return manager;
  }

  try {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { packageManager?: string };
    // Corepack's format is `pnpm@11.17.0`, sometimes with a hash suffix.
    const declared = manifest.packageManager?.split('@')[0];
    if (declared === 'pnpm' || declared === 'yarn' || declared === 'bun' || declared === 'npm') return declared;
  } catch {
    // No package.json, or unparseable — fall through rather than fail. This runs inside
    // diagnostics, where throwing would replace a useful message with a stack trace.
  }

  const userAgent = process.env['npm_config_user_agent'] ?? '';
  for (const manager of ['pnpm', 'yarn', 'bun'] as const) {
    if (userAgent.startsWith(manager)) return manager;
  }
  return 'npm';
}

/**
 * How this manager adds dev dependencies. The verb differs, not just the binary: npm takes
 * `install -D`, the others take `add -D`, and bun spells the flag `-d`. Naming the right
 * manager with the wrong subcommand is still a command that does not run.
 */
export function addDevCommand(manager: PackageManagerName, packages: readonly string[]): string {
  const list = packages.join(' ');
  if (manager === 'npm') return `npm install -D ${list}`;
  if (manager === 'bun') return `bun add -d ${list}`;
  return `${manager} add -D ${list}`;
}

/** How this manager installs a CLI globally. yarn is the odd one — `yarn global add`. */
export function addGlobalCommand(manager: PackageManagerName, packageName: string): string {
  if (manager === 'npm') return `npm install -g ${packageName}`;
  if (manager === 'yarn') return `yarn global add ${packageName}`;
  return `${manager} add -g ${packageName}`;
}
