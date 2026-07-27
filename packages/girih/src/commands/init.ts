import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import pc from 'picocolors';
import { CONFIG_FILENAMES } from '@faravahar/girih-core';
import { scaffoldWorkspace } from '../scaffold.js';
import { BRAND_NAME, PACKAGE_NAME } from '../self.js';
import { hasResolvableCli } from '../workspace.js';
import type { Command } from 'commander';

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Scaffold a girih workspace in the current directory (for a project that already has a package.json).')
    .option('--name <package>', 'published package name (default: @<dir>/design-system)')
    .option('--brand <name>', 'default brand name', 'main')
    .action(async (options: { name?: string; brand: string }) => {
      const cwd = process.cwd();
      const existing = CONFIG_FILENAMES.find((f) => existsSync(join(cwd, f)));
      if (existing) {
        console.error(pc.red(`${existing} already exists here — refusing to scaffold over a workspace.`));
        process.exitCode = 1;
        return;
      }
      for (let ancestor = dirname(cwd); ancestor !== dirname(ancestor); ancestor = dirname(ancestor)) {
        if (CONFIG_FILENAMES.some((f) => existsSync(join(ancestor, f)))) {
          console.log(pc.yellow(`note: ${ancestor} is already a girih workspace — you are creating a nested one.`));
          break;
        }
      }

      if (!BRAND_NAME.test(options.brand)) {
        console.error(pc.red(`Brand name '${options.brand}' must be lowercase kebab-case (it becomes a [data-brand] selector).`));
        process.exitCode = 1;
        return;
      }
      const name = options.name ?? `@${basename(cwd)}/design-system`;
      if (!PACKAGE_NAME.test(name)) {
        console.error(pc.red(`'${name}' is not a valid npm package name.`));
        if (!options.name) console.error(pc.dim(`(derived from the directory name — pass --name @scope/design-system explicitly)`));
        process.exitCode = 1;
        return;
      }

      const { written } = await scaffoldWorkspace(cwd, { name, brand: options.brand });
      for (const path of written) console.log(`${pc.green('create')}  ${path}`);
      console.log(`\n${pc.bold(name)} is ready. Next steps:`);
      if (!hasResolvableCli(cwd)) {
        console.log(`  ${pc.cyan('npm install -D @faravahar/girih')}   (ds.config.ts imports it)`);
      }
      console.log(`  ${pc.cyan('girih check')}           validate tokens and contracts`);
      console.log(`  ${pc.cyan('girih generate react')}  compile the design system package`);
      console.log(`  ${pc.cyan('open demo/index.html')}  see every variant, size, and brand`);
      console.log(`  ${pc.cyan('girih brand create <name>')}  add a brand overlay`);
    });
}
