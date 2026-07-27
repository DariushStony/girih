import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import pc from 'picocolors';
import { displayPath } from '../output.js';
import { detectPackageManager } from '../package-manager.js';
import { scaffoldWorkspace, workspacePackageJson } from '../scaffold.js';
import { BRAND_NAME, PACKAGE_NAME, PACKAGE_SELF, RUNTIME_PACKAGE, SELF_VERSION } from '../self.js';
import type { Command } from 'commander';

export function registerCreate(program: Command): void {
  program
    .command('create <directory>')
    .description('Create a new girih workspace in a new directory, then install and initialise it.')
    .option('--name <package>', 'published package name (default: @<directory>/design-system)')
    .option('--brand <name>', 'default brand name', 'main')
    .option('--no-install', 'scaffold only; print the install command instead of running it')
    .action(async (directory: string, options: { name?: string; brand: string; install: boolean }) => {
      const dir = resolve(process.cwd(), directory);
      const workspaceName = basename(dir);

      if (existsSync(join(dir, 'package.json'))) {
        console.error(pc.red(`${dir} already has a package.json — refusing to scaffold over it.`));
        process.exitCode = 1;
        return;
      }
      if (!BRAND_NAME.test(options.brand)) {
        console.error(pc.red(`Brand name '${options.brand}' must be lowercase kebab-case (it becomes a [data-brand] selector).`));
        process.exitCode = 1;
        return;
      }
      const name = options.name ?? `@${workspaceName}/design-system`;
      if (!PACKAGE_NAME.test(name)) {
        console.error(pc.red(`'${name}' is not a valid npm package name.`));
        if (!options.name) console.error(pc.dim(`(derived from the directory name — pass --name @scope/design-system explicitly)`));
        process.exitCode = 1;
        return;
      }

      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, 'package.json'),
        workspacePackageJson({ workspaceName, cliPackage: PACKAGE_SELF, runtimePackage: RUNTIME_PACKAGE, version: SELF_VERSION }),
        'utf8',
      );
      console.log(`${pc.green('create')}  ${displayPath(join(directory, 'package.json'))}`);
      const { written } = await scaffoldWorkspace(dir, { name, brand: options.brand });
      for (const path of written) console.log(`${pc.green('create')}  ${displayPath(join(directory, path))}`);

      const packageManager = detectPackageManager();
      if (!options.install) {
        console.log(`\n${pc.bold(name)} scaffolded. Finish with:`);
        console.log(`  ${pc.cyan(`cd ${directory} && ${packageManager} install`)}`);
        return;
      }

      console.log(`\ninstall (${packageManager})…`);
      const install = spawnSync(packageManager, ['install'], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
      if (install.status !== 0) {
        console.error(pc.red(`\n${packageManager} install failed — run it yourself in ${directory}.`));
        process.exitCode = install.status ?? 1;
        return;
      }

      console.log(`\n${pc.bold(name)} is ready:`);
      console.log(`  ${pc.cyan(`cd ${directory}`)}`);
      console.log(`  ${pc.cyan('girih check')}           validate tokens and contracts`);
      console.log(`  ${pc.cyan('girih generate react')}  compile the design system package`);
      console.log(`  ${pc.cyan('open demo/index.html')}  see every variant, size, and brand`);
    });
}
