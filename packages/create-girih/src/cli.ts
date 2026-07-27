#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { ask, confirm, isInteractive } from './prompt.js';
import { scaffoldDevDependencies } from './versions.js';

/**
 * npx create-girih <dir> — creates the directory and package.json, installs
 * @faravahar/girih, then delegates to the installed `girih init`. The workspace
 * template lives in @faravahar/girih so bootstrapper and CLI can never drift apart.
 */
const USAGE = `Usage: create-girih [directory] [--name @scope/design-system] [--brand main] [--workspace] [--no-install]

  [directory]   folder to create; prompted for when omitted and a terminal is attached
  --name        published package name (default: @<directory>/design-system)
  --brand       default brand, lowercase kebab-case (default: main)
  --workspace   link the girih packages by workspace protocol (monorepo development)
  --no-install  scaffold only; print the install and init commands to run yourself
  -v, --version print the create-girih version
  -h, --help    show this message

Example: npx create-girih my-ds --name @acme/design-system`;
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
    if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    }
    if (arg === '--version' || arg === '-v') {
      // Read at runtime, not via an import attribute: the bundler would inline the
      // whole manifest and ship this package's devDependency list inside dist/.
      const { version } = createRequire(import.meta.url)('../package.json') as { version: string };
      console.log(version);
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
        // Any leading dash, not just '--': otherwise '-x' is taken as the directory name.
        if (arg.startsWith('-')) return { error: `unknown flag ${arg}` };
        if (args.dir) return { error: `unexpected argument '${arg}' (directory already set to '${args.dir}')` };
        args.dir = arg;
    }
  }
  // The directory is filled in by prompting when a human is present; only a
  // non-interactive run needs it up front.
  return args;
}

const parsed = parseArgs(process.argv.slice(2));
if ('error' in parsed) {
  console.error(`create-girih: ${parsed.error}\n${USAGE}`);
  process.exit(1);
}

if (!parsed.dir && !isInteractive()) {
  console.error(`create-girih: missing <directory>\n${USAGE}`);
  process.exit(1);
}

/**
 * Ask only for what was not passed, so `npx create-girih` is conversational while
 * `npx create-girih my-ds --name @acme/ds` stays a one-liner. A flag always wins over
 * a prompt — otherwise scripting it would mean answering questions.
 */
if (isInteractive()) {
  if (!parsed.dir) {
    console.log('\nCreating a girih design system.\n');
    parsed.dir = await ask('Directory', {
      default: 'my-ds',
      validate: (value) =>
        existsSync(join(resolve(process.cwd(), value), 'package.json')) ? 'that directory already has a package.json' : null,
    });
  }
  if (!parsed.name) {
    parsed.name = await ask('Published package name', {
      default: `@${basename(resolve(process.cwd(), parsed.dir))}/design-system`,
      validate: (value) => (PACKAGE_NAME.test(value) ? null : 'not a valid npm package name'),
    });
  }
  // 'main' is the parser default, so an explicit --brand main is indistinguishable from
  // none — asking anyway costs one keypress and makes the default visible.
  parsed.brand = await ask('Default brand', {
    default: parsed.brand,
    validate: (value) => (BRAND_NAME.test(value) ? null : 'must be lowercase kebab-case (it becomes a [data-brand] selector)'),
  });
  if (parsed.install) parsed.install = await confirm('Install dependencies now?', true);
  console.log('');
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
      devDependencies: scaffoldDevDependencies(parsed.workspace),
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
