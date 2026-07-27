import { join } from 'node:path';
import pc from 'picocolors';
import { verifyEmittedFiles } from '@faravahar/girih-core';
import { generateCss } from '@faravahar/girih-generator-css';
import { buildPackage } from '../build.js';
import { printDiagnostics } from '../output.js';
import { composeReact, loadWorkspace } from '../workspace.js';
import type { Command } from 'commander';

export function registerBuild(program: Command): void {
  program
    .command('build')
    .description('Compile the generated React package into publishable dist/ (ESM + .d.ts).')
    .action(async () => {
      const workspace = await loadWorkspace();
      if (!workspace) return;
      const { config, build } = workspace;
      const cssResult = await generateCss(build, {
        prefix: config.tokens.prefix,
        defaultBrand: config.brands.default,
        selector: config.targets.css.selector,
      });
      build.diagnostics.push(...cssResult.diagnostics);
      const composed = await composeReact(config, build, cssResult.files);
      if (build.diagnostics.some((d) => d.severity === 'error')) {
        printDiagnostics(build.diagnostics);
        process.exitCode = 1;
        return;
      }

      const outputBase = config.targets.react.output;
      const outDir = join(config.root, outputBase);
      const stale = await verifyEmittedFiles(outDir, composed.files);
      if (stale.length > 0) {
        console.error(pc.red(`The generated package is out of date — run \`girih generate react\` before building.`));
        for (const path of stale) console.error(`  ${pc.dim(join(outputBase, path))}`);
        process.exitCode = 1;
        return;
      }

      const result = await buildPackage(outDir);
      build.diagnostics.push(...result.diagnostics);
      if (result.diagnostics.some((d) => d.severity === 'error')) {
        printDiagnostics(build.diagnostics);
        console.error(pc.red('\nBuild failed.'));
        process.exitCode = 1;
        return;
      }
      const js = result.files.filter((f) => f.path.endsWith('.js')).length;
      const dts = result.files.filter((f) => f.path.endsWith('.d.ts')).length;
      console.log(
        `${pc.green('build')}  ${join(outputBase, 'dist')} ${pc.dim(`(${js} module${js === 1 ? '' : 's'} + ${dts} declaration${dts === 1 ? '' : 's'})`)}`,
      );
      printDiagnostics(build.diagnostics.filter((d) => d.severity !== 'info'));
    });
}
