import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { CONFIG_FILENAMES, loadConfig } from '@faravahar/girih-core';
import { missingBuildDependencies } from './build.js';
import { fetchLatestVersions, updateChecksDisabled } from './registry.js';
import { installedVersion, resolvesFrom } from './resolve.js';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface Check {
  label: string;
  status: CheckStatus;
  detail: string;
  /** A command or edit that resolves it. Omitted when there is nothing to do. */
  fix?: string;
}

const self = createRequire(import.meta.url)('../package.json') as {
  name: string;
  version: string;
  engines?: { node?: string };
  dependencies?: Record<string, string>;
};

/** Minimum major from our own engines field, so the floor has one source of truth. */
function requiredNodeMajor(): number | null {
  const match = /(\d+)/.exec(self.engines?.node ?? '');
  return match ? Number(match[1]) : null;
}

function checkNode(): Check {
  const required = requiredNodeMajor();
  const current = process.versions.node;
  const major = Number(current.split('.')[0]);
  if (required === null) return { label: 'node', status: 'ok', detail: current };
  if (major < required) {
    return {
      label: 'node',
      status: 'fail',
      detail: `v${current} — girih requires >=${required}`,
      // Named because it is the real constraint, and the error it causes otherwise
      // surfaces from deep inside a dependency rather than from girih.
      fix: `Upgrade Node to ${required} or newer (style-dictionary requires it).`,
    };
  }
  return { label: 'node', status: 'ok', detail: `v${current} (>=${required} required)` };
}

function checkPackageManager(cwd: string): Check {
  const agent = process.env['npm_config_user_agent'] ?? '';
  const fromAgent = /^([a-z]+)\/(\S+)/.exec(agent);
  if (fromAgent) return { label: 'package manager', status: 'ok', detail: `${fromAgent[1]} ${fromAgent[2]}` };

  const lockfiles: Array<[string, string]> = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['package-lock.json', 'npm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
  ];
  // Walk up, the way the package managers themselves do: in a monorepo the lockfile
  // sits at the root, not beside the workspace that is being diagnosed.
  for (let current = cwd; ; current = dirname(current)) {
    for (const [file, manager] of lockfiles) {
      if (existsSync(join(current, file))) {
        return { label: 'package manager', status: 'ok', detail: `${manager} (${join(current, file)})` };
      }
    }
    if (current === dirname(current)) break;
  }
  return { label: 'package manager', status: 'warn', detail: 'could not determine — no lockfile found and no user-agent set' };
}

function checkCliResolution(cwd: string): Check {
  if (resolvesFrom(cwd, self.name)) {
    return { label: self.name, status: 'ok', detail: `resolves from ${cwd}` };
  }
  // A globally installed CLI still works for scaffolding, but ds.config.ts imports
  // the package by name — so jiti cannot load the config without a local copy.
  return {
    label: self.name,
    status: 'warn',
    detail: 'not resolvable here — fine for `girih create`, but ds.config.ts imports it by name',
    fix: `npm install -D ${self.name}`,
  };
}

async function checkWorkspace(cwd: string): Promise<Check[]> {
  const hasConfig = CONFIG_FILENAMES.some((f) => existsSync(join(cwd, f)));
  if (!hasConfig) {
    return [
      {
        label: 'workspace',
        status: 'warn',
        detail: 'no ds.config.ts here — workspace checks skipped',
        fix: 'Run `girih create <name>` for a new workspace, or `girih init` to add girih to this one.',
      },
    ];
  }

  const { config, diagnostics } = await loadConfig(cwd);
  if (!config) {
    const first = diagnostics.find((d) => d.severity === 'error');
    return [
      {
        label: 'ds.config.ts',
        status: 'fail',
        detail: first?.message ?? 'failed to load',
        ...(first?.help ? { fix: first.help } : {}),
      },
    ];
  }

  const checks: Check[] = [
    {
      label: 'ds.config.ts',
      status: 'ok',
      detail: `${config.name} · ${config.brands.all.length} brand${config.brands.all.length === 1 ? '' : 's'} · default '${config.brands.default}'`,
    },
  ];

  // Build prerequisites, but only once there is something to build. Derived from the
  // emitted manifest, so it covers the headless layer when a dialog contract needs it.
  const packageDir = join(config.root, config.targets.react.output);
  if (existsSync(join(packageDir, 'package.json'))) {
    const missing = await missingBuildDependencies(packageDir);
    checks.push(
      missing.length === 0
        ? { label: 'build prerequisites', status: 'ok', detail: 'react, types and the runtime are installed' }
        : {
            label: 'build prerequisites',
            status: 'fail',
            detail: `${missing.join(', ')} missing — \`girih build\` will not compile`,
            fix: `npm install -D ${missing.join(' ')}`,
          },
    );
  } else {
    checks.push({
      label: 'build prerequisites',
      status: 'warn',
      detail: 'nothing generated yet',
      fix: 'girih generate react',
    });
  }

  return checks;
}

/**
 * Internal girih deps publish as exact pins, so a partially-upgraded node_modules is a
 * real state with confusing symptoms — a generator disagreeing with the spec that fed
 * it. Inside the monorepo the ranges are `workspace:*` and there is nothing to compare.
 */
function checkVersionSkew(cwd: string): Check[] {
  const pinned = Object.entries(self.dependencies ?? {}).filter(
    ([name, range]) => name.startsWith('@faravahar/girih') && !range.startsWith('workspace:'),
  );
  if (pinned.length === 0) return [];

  const skewed = pinned.flatMap(([name, expected]) => {
    const actual = installedVersion(cwd, name);
    if (actual === null) return [`${name} not installed (expected ${expected})`];
    return actual === expected ? [] : [`${name} ${actual}, expected ${expected}`];
  });

  return [
    skewed.length === 0
      ? { label: 'girih packages', status: 'ok', detail: `${pinned.length} internal packages at ${self.version}` }
      : {
          label: 'girih packages',
          status: 'fail',
          detail: skewed.join('; '),
          fix: 'Reinstall so every @faravahar/girih-* pin matches: `girih update`, or delete node_modules and install again.',
        },
  ];
}

async function checkForUpdate(): Promise<Check[]> {
  if (updateChecksDisabled()) {
    return [{ label: 'updates', status: 'ok', detail: 'check disabled by GIRIH_NO_UPDATE_CHECK' }];
  }
  const versions = await fetchLatestVersions([self.name]);
  const latest = versions[self.name];
  if (!latest) {
    return [{ label: 'updates', status: 'warn', detail: 'could not reach the npm registry' }];
  }
  if (latest === self.version) {
    return [{ label: 'updates', status: 'ok', detail: `${self.version} is the latest` }];
  }
  return [
    {
      label: 'updates',
      status: 'warn',
      detail: `${self.version} installed, ${latest} available`,
      fix: `girih update  (or: npm install -g ${self.name}@latest)`,
    },
  ];
}

/**
 * Environment diagnosis, deliberately disjoint from `girih check`: `check` validates
 * the workspace's *content* (tokens, contracts, drift), `doctor` validates the
 * *environment* it runs in. The two together explain "it worked on my machine".
 */
export async function runDoctor(cwd: string, options: { offline?: boolean } = {}): Promise<Check[]> {
  return [
    checkNode(),
    checkPackageManager(cwd),
    checkCliResolution(cwd),
    ...(await checkWorkspace(cwd)),
    ...checkVersionSkew(cwd),
    ...(options.offline ? [] : await checkForUpdate()),
  ];
}

/** girih packages declared by the workspace at `cwd`, with the ranges it asked for. */
export async function workspaceGirihDependencies(cwd: string): Promise<Record<string, string>> {
  const path = join(cwd, 'package.json');
  const manifest = JSON.parse(await readFile(path, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const all = { ...manifest.dependencies, ...manifest.devDependencies };
  return Object.fromEntries(
    Object.entries(all).filter(([name, range]) => name.startsWith('@faravahar/girih') && !range.startsWith('workspace:')),
  );
}
