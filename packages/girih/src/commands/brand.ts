import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import pc from 'picocolors';
import { emittedFile, loadConfig, writeEmittedFiles } from '@faravahar/girih-core';
import { printDiagnostics } from '../output.js';
import { BRAND_NAME } from '../self.js';
import type { Command } from 'commander';

export function registerBrand(program: Command): void {
  program
    .command('brand')
    .description('Manage brand overlays.')
    .command('create <name>')
    .description('Add a brand overlay and register it in ds.config.ts.')
    .action(async (name: string) => {
      const { config, diagnostics } = await loadConfig(process.cwd());
      if (!config) {
        printDiagnostics(diagnostics);
        process.exitCode = 1;
        return;
      }
      if (config.brands.all.some((b) => b.name === name)) {
        console.error(pc.red(`Brand '${name}' already exists.`));
        process.exitCode = 1;
        return;
      }
      if (!BRAND_NAME.test(name)) {
        console.error(pc.red(`Brand name '${name}' must be lowercase kebab-case (it becomes a [data-brand] selector).`));
        process.exitCode = 1;
        return;
      }

      const overlayPath = `design/brands/${name}.json`;
      if (existsSync(join(config.root, overlayPath))) {
        console.log(`${pc.yellow('keep')}    ${overlayPath} ${pc.dim('(already exists — not overwritten)')}`);
      } else {
        await writeEmittedFiles(config.root, [emittedFile(overlayPath, '{}\n')]);
        console.log(`${pc.green('create')}  ${overlayPath}`);
      }

      // Conservative auto-registration: insert right after `definitions: {`.
      // Keys are quoted so kebab-case brand names stay valid TypeScript.
      // If the config was reformatted beyond recognition, print the snippet instead.
      const configPath = join(config.root, 'ds.config.ts');
      const source = await readFile(configPath, 'utf8');
      const match = source.match(/definitions:\s*\{\n(\s*)/);
      const snippet = `'${name}': { tokens: '${overlayPath}' },`;
      if (match) {
        const insertAt = match.index! + match[0].length;
        await writeFile(
          configPath,
          `${source.slice(0, insertAt - match[1]!.length)}${match[1]}${snippet}\n${match[1]}${source.slice(insertAt)}`,
          'utf8',
        );
        console.log(`${pc.green('update')}  ds.config.ts ${pc.dim(`(registered '${name}')`)}`);
      } else {
        console.log(pc.yellow(`Could not safely edit ds.config.ts — add this under brands.definitions yourself:`));
        console.log(`  ${snippet}`);
      }
      console.log(`\nOverride tokens in ${pc.cyan(overlayPath)} (values only — new paths are rejected), then regenerate.`);
    });
}
