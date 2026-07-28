#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { ask, confirm, isInteractive } from './prompt.js';
import { scaffoldWorkspace } from '@faravahar/girih/scaffold';
import { scaffoldDevDependencies } from './versions.js';

/**
 * npx create-girih <dir> — writes a complete workspace, then installs it with whichever
 * package manager invoked us.
 *
 * Installing matters because the scaffolded package.json's scripts call `girih`: leave the
 * install out and `pnpm run generate` fails on a missing binary, the same way it would in a
 * create-next-app project with no `next`. The manager is never hardcoded — `pnpm create
 * girih` installs with pnpm — and `--no-install` opts out entirely.
 *
 * Scaffolding happens before the install and no longer delegates to `girih init`, so a
 * failed or skipped install still leaves a complete, readable project. The templates come
 * from @faravahar/girih/scaffold, the same module `girih init` uses, so a workspace created
 * either way is byte-identical. tsup inlines that subpath at build time, which is why this
 * package still publishes with zero runtime dependencies; importing the package's barrel
 * instead drags in jiti and takes the bundle from 16KB to 280KB.
 */
const USAGE = `Usage: create-girih [directory] [--name @scope/design-system] [--brand main] [--workspace]

  [directory]   folder to create; prompted for when omitted and a terminal is attached
  --name        published package name (default: @<directory>/design-system)
  --brand       default brand, lowercase kebab-case (default: main)
  --workspace   link the girih packages by workspace protocol (monorepo development)
  --public      publish the design system publicly (default: private to your org)
  --no-install  scaffold only; print the commands to finish yourself
  -v, --version print the create-girih version
  -h, --help    show this message

Installs with whichever package manager ran this — pnpm, yarn, bun or npm.

Example: npx create-girih my-ds --name @acme/design-system`;
const BRAND_NAME = /^[a-z][a-z0-9-]*$/;
const PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

interface Args {
  dir?: string;
  name?: string;
  brand: string;
  workspace: boolean;
  install: boolean;
  /** undefined until chosen, so a prompt can tell "not asked" from "asked and declined". */
  access?: 'public' | 'restricted';
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
      case '--public':
        args.access = 'public';
        break;
      case '--private':
        args.access = 'restricted';
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
  // Defaults to no. A public publish cannot be taken back, and npm's own default for a
  // scoped package is restricted — so the safe answer is also the unsurprising one.
  if (parsed.access === undefined) {
    parsed.access = (await confirm('Publish this design system publicly?', false)) ? 'public' : 'restricted';
  }
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

/**
 * Which package manager invoked us. `npm_config_user_agent` is set by every one of them
 * when running `<pm> create girih` or `npx create-girih`, so it is reliable *here* — unlike
 * inside an already-created workspace, where girih reads the lockfile instead.
 *
 * Used only to phrase the next steps. Nothing is spawned, so guessing wrong now costs a
 * misleading sentence rather than an install with the wrong tool.
 */
function detectPackageManager(): string {
  const userAgent = process.env.npm_config_user_agent ?? '';
  if (userAgent.startsWith('pnpm')) return 'pnpm';
  if (userAgent.startsWith('yarn')) return 'yarn';
  if (userAgent.startsWith('bun')) return 'bun';
  return 'npm';
}

// The same templates `girih init` writes, from the same module — so a scaffold produced
// here and one produced there are byte-identical.
const { written } = await scaffoldWorkspace(dir, {
  name: resolvedPackageName,
  brand: parsed.brand,
  access: parsed.access ?? 'restricted',
});
for (const path of written) console.log(`create  ${workspaceName}/${path}`);

const packageManager = detectPackageManager();

if (!parsed.install) {
  console.log(`\n${resolvedPackageName} is scaffolded. The scripts call \`girih\`, so install before running them:`);
  console.log(`\n  cd ${parsed.dir}`);
  console.log(`  ${packageManager} install`);
  console.log(`  ${packageManager} run generate      compile the design system package`);
  console.log(`\n  open demo/index.html  see every variant, size and brand`);
  process.exit(0);
}

// Package managers are .cmd shims on Windows, so spawning them needs a shell there.
console.log(`\ninstall (${packageManager})…`);
const install = spawnSync(packageManager, ['install'], {
  cwd: dir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (install.status !== 0) {
  // The workspace is already complete, so this is recoverable — say so rather than
  // implying the scaffold failed too.
  console.error(`\n${packageManager} install failed. ${resolvedPackageName} is scaffolded; finish with:`);
  console.error(`  cd ${parsed.dir} && ${packageManager} install`);
  process.exit(install.status ?? 1);
}

console.log(`\n${resolvedPackageName} is ready.`);
console.log(`\n  cd ${parsed.dir}`);
console.log(`  ${packageManager} run generate      compile the design system package`);
console.log(`  ${packageManager} run check         validate tokens and contracts`);
console.log(`\n  open demo/index.html  see every variant, size and brand`);
