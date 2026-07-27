import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import pc from 'picocolors';
import { verifyEmittedFiles, writeEmittedFiles } from '@faravahar/girih-core';
import { generateCss } from '@faravahar/girih-generator-css';
import { detectDrift, planManifestUpdate, readManifest, writeManifest } from '../manifest.js';
import { displayPath, printDiagnostics, printSummaryLine } from '../output.js';
import { composeReact, loadWorkspace } from '../workspace.js';
import type { Command } from 'commander';
import type { EmittedFile } from '@faravahar/girih-core';

export function registerGenerate(program: Command): void {
  program
    .command('generate')
    .argument('[target]', 'what to generate (css | react)', 'css')
    .option('--check', 'verify the generated output on disk is up to date instead of writing')
    .option('--force', 'overwrite generated files even if they were edited by hand')
    .description('Generate design system artifacts from the workspace definition.')
    .action(async (target: string, options: { check?: boolean; force?: boolean }) => {
      if (target !== 'css' && target !== 'react') {
        console.error(pc.red(`Unknown target '${target}'. Available targets: css, react.`));
        process.exitCode = 1;
        return;
      }
      const workspace = await loadWorkspace();
      if (!workspace) return;
      const { config, build } = workspace;

      if (build.diagnostics.some((d) => d.severity === 'error')) {
        printDiagnostics(build.diagnostics);
        printSummaryLine(build.diagnostics);
        console.error(pc.red('\nRefusing to generate from a broken token set.'));
        process.exitCode = 1;
        return;
      }

      const cssResult = await generateCss(build, {
        prefix: config.tokens.prefix,
        defaultBrand: config.brands.default,
        selector: config.targets.css.selector,
      });
      build.diagnostics.push(...cssResult.diagnostics);

      let files: EmittedFile[];
      let outputBase: string;
      let irFiles: EmittedFile[] = [];
      if (target === 'react') {
        const composed = await composeReact(config, build, cssResult.files);
        if (build.diagnostics.some((d) => d.severity === 'error')) {
          printDiagnostics(build.diagnostics);
          printSummaryLine(build.diagnostics);
          console.error(pc.red('\nRefusing to generate — fix the errors above.'));
          process.exitCode = 1;
          return;
        }
        outputBase = config.targets.react.output;
        files = composed.files;
        irFiles = composed.irFiles;
      } else {
        outputBase = config.targets.css.output;
        files = cssResult.files;
      }

      if (build.diagnostics.some((d) => d.severity === 'error')) {
        printDiagnostics(build.diagnostics);
        printSummaryLine(build.diagnostics);
        console.error(pc.red('\nRefusing to write broken output.'));
        process.exitCode = 1;
        return;
      }

      const outDir = join(config.root, outputBase);
      if (options.check) {
        const stale = await verifyEmittedFiles(outDir, files);
        for (const path of stale) console.log(`${pc.red('stale')}  ${displayPath(join(outputBase, path))}`);
        if (stale.length > 0) {
          console.error(pc.red(`\n${stale.length} file(s) out of date — run \`girih generate ${target}\`.`));
          process.exitCode = 1;
        } else {
          console.log(pc.green('✔ generated output is up to date'));
        }
      } else {
        // Drift gate: never silently clobber generated files a human edited.
        const { manifest, invalid } = await readManifest(config.root);
        if (invalid && !options.force) {
          console.error(pc.red('.ds/manifest.json is corrupt or from an incompatible girih version — the drift gate cannot run.'));
          console.error(pc.dim('Delete .ds/manifest.json (or rerun with --force) if the generated output has no hand edits.'));
          process.exitCode = 1;
          return;
        }
        const drifted = await detectDrift(config.root, manifest);
        if (drifted.length > 0 && !options.force) {
          for (const path of drifted) console.error(`${pc.red('edited')}  ${path}`);
          console.error(
            pc.red(`\nGenerated output was edited by hand — refusing to overwrite.`) +
              pc.dim(` Undo the edits, eject the component (M5), or rerun with --force.`),
          );
          process.exitCode = 1;
          return;
        }

        const { next, orphans } = planManifestUpdate(manifest, target, outputBase, files);
        await writeEmittedFiles(outDir, files);
        for (const orphan of orphans) {
          await rm(join(config.root, orphan), { force: true });
          console.log(`${pc.yellow('remove')}  ${orphan} ${pc.dim('(no longer generated)')}`);
        }
        if (irFiles.length > 0) {
          // The IR directory is fully derived — clear it so renamed components leave no stale JSON.
          await rm(join(config.root, '.ds/ir'), { recursive: true, force: true });
          await writeEmittedFiles(join(config.root, '.ds/ir'), irFiles);
        }
        await writeManifest(config.root, next);
        for (const file of files) {
          console.log(`${pc.green('write')}  ${displayPath(join(outputBase, file.path))} ${pc.dim(`(${file.contents.length} bytes)`)}`);
        }
        if (irFiles.length > 0) {
          console.log(`${pc.green('write')}  .ds/ir/ ${pc.dim(`(${irFiles.length} component IR file${irFiles.length === 1 ? '' : 's'})`)}`);
        }
        if (target === 'react' && existsSync(join(config.root, 'demo/index.html'))) {
          console.log(`\nPreview: ${pc.cyan('open demo/index.html')} · usage: ${pc.cyan(displayPath(join(outputBase, 'README.md')))}`);
        }
      }

      printDiagnostics(build.diagnostics.filter((d) => d.severity !== 'info'));
      if (build.diagnostics.some((d) => d.severity === 'error')) process.exitCode = 1;
    });
}
