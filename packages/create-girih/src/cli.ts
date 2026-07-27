#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';

/**
 * npx create-girih <dir> — creates the directory and package.json, installs
 * @faravahar/girih, then delegates to the installed `girih init`. The workspace
 * template lives in @faravahar/girih so bootstrapper and CLI can never drift apart.
 */
const USAGE = 'Usage: create-girih <directory> [--name @scope/design-system] [--brand main] [--workspace] [--no-install]';
const BRAND_NAME = /^[a-z][a-z0-9-]*$/;
const PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

interface Args {
  dir?: string;
  name?: string;
  brand: string;
  workspace: boolean;
  install: boolean;
}

function parseArgs(argv: string[]): Args | { error: string } {
  const args: Args = { brand: 'main', workspace: false, install: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help') {
      console.log(USAGE);
      process.exit(0);
    }
    switch (arg) {
      case '--name':
      case '--brand': {
        const value = argv[++i];
        if (!value || value.startsWith('--')) return { error: `${arg} needs a value` };
        if (arg === '--name') args.name = value;
        else args.brand = value;
        break;
      }
      case '--workspace':
        args.workspace = true;
        break;
      case '--no-install':
        args.install = false;
        break;
      default:
        if (arg.startsWith('--')) return { error: `unknown flag ${arg}` };
        if (args.dir) return { error: `unexpected argument '${arg}' (directory already set to '${args.dir}')` };
        args.dir = arg;
    }
  }
  if (!args.dir) return { error: 'missing <directory>' };
  return args;
}

const parsed = parseArgs(process.argv.slice(2));
if ('error' in parsed) {
  console.error(`create-girih: ${parsed.error}\n${USAGE}`);
  process.exit(1);
}

const dir = resolve(process.cwd(), parsed.dir!);
const workspaceName = basename(dir);
const resolvedPackageName = parsed.name ?? `@${workspaceName}/design-system`;

if (!BRAND_NAME.test(parsed.brand)) {
  console.error(`create-girih: brand '${parsed.brand}' must be lowercase kebab-case`);
  process.exit(1);
}
if (!PACKAGE_NAME.test(resolvedPackageName)) {
  console.error(
    `create-girih: '${resolvedPackageName}' is not a valid npm package name` +
      (parsed.name ? '' : ` (derived from the directory — pass --name @scope/design-system)`),
  );
  process.exit(1);
}
if (existsSync(join(dir, 'package.json'))) {
  console.error(`${dir} already has a package.json — refusing to scaffold over it.`);
  process.exit(1);
}

// --workspace links @faravahar/girih via the pnpm workspace protocol (for development
// inside the girih monorepo); the default targets the published package.
const cliVersion = parsed.workspace ? 'workspace:*' : '^0.1.0';

await mkdir(dir, { recursive: true });
await writeFile(
  join(dir, 'package.json'),
  JSON.stringify(
    {
      name: workspaceName,
      private: true,
      type: 'module',
      scripts: {
        check: 'girih check',
        generate: 'girih generate react',
        'generate:check': 'girih generate react --check',
      },
      devDependencies: { '@faravahar/girih': cliVersion },
    },
    null,
    2,
  ) + '\n',
  'utf8',
);
console.log(`create  ${workspaceName}/package.json`);

function detectPackageManager(): string {
  const userAgent = process.env.npm_config_user_agent ?? '';
  if (userAgent.startsWith('pnpm')) return 'pnpm';
  if (userAgent.startsWith('yarn')) return 'yarn';
  if (userAgent.startsWith('bun')) return 'bun';
  return 'npm';
}

const packageManager = detectPackageManager();
// The `--` separator is load-bearing: without it `npm exec` eats --name/--brand
// as npm config and forwards their values as positionals.
const initArgs = ['exec', '--', 'girih', 'init', '--name', resolvedPackageName, '--brand', parsed.brand];
// npm/pnpm/yarn are .cmd shims on Windows; spawning them needs a shell there.
const spawnOptions = { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' } as const;

if (!parsed.install) {
  console.log(`\nScaffolded ${dir}. Finish setup with:`);
  console.log(`  cd ${parsed.dir} && ${packageManager} install && ${packageManager} ${initArgs.join(' ')}`);
  process.exit(0);
}

console.log(`install (${packageManager})…`);
const install = spawnSync(packageManager, ['install'], spawnOptions);
if (install.status !== 0) {
  console.error(`\n${packageManager} install failed — run it yourself, then: ${packageManager} ${initArgs.join(' ')}`);
  process.exit(install.status ?? 1);
}

const init = spawnSync(packageManager, initArgs, spawnOptions);
process.exit(init.status ?? 0);
