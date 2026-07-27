import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Which package manager invoked us. The user-agent is set by npm/pnpm/yarn/bun when
 * running through them; a lockfile is the fallback for a global install.
 */
export function detectPackageManager(): string {
  const userAgent = process.env['npm_config_user_agent'] ?? '';
  for (const manager of ['pnpm', 'yarn', 'bun'] as const) {
    if (userAgent.startsWith(manager)) return manager;
  }
  if (userAgent.startsWith('npm')) return 'npm';
  for (const [file, manager] of [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
  ] as const) {
    if (existsSync(join(process.cwd(), file))) return manager;
  }
  return 'npm';
}
