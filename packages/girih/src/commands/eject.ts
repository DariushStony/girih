import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pc from 'picocolors';
import { emittedFile, writeEmittedFiles } from '@faravahar/girih-core';
import { TEMPLATE_REGISTRY, renderComponentSource } from '@faravahar/girih-generator-react';
import { readLock, writeLock } from '../lock.js';
import { readManifest } from '../manifest.js';
import { printDiagnostics } from '../output.js';
import { RUNTIME_PACKAGE } from '../self.js';
import { loadComponentIRs, loadWorkspace } from '../workspace.js';
import type { Command } from 'commander';

export function registerEject(program: Command): void {
  program
    .command('eject <component>')
    .description('Convert one generated component into a tracked, user-owned fork.')
    .action(async (componentName: string) => {
      const workspace = await loadWorkspace();
      if (!workspace) return;
      const { config, build } = workspace;
      const { irs, extensions } = await loadComponentIRs(config, build);
      if (build.diagnostics.some((d) => d.severity === 'error')) {
        printDiagnostics(build.diagnostics);
        process.exitCode = 1;
        return;
      }

      const ir = irs.find((candidate) => candidate.name === componentName);
      if (!ir) {
        const extension = extensions.find((e) => e.extension.name === componentName);
        if (extension) {
          console.error(
            pc.red(
              `'${componentName}' is an extension (${extension.file}) — extensions are pure data and always regenerated; edit the .ext.ts instead of ejecting.`,
            ),
          );
        } else {
          console.error(pc.red(`Unknown component '${componentName}'. Catalog: ${irs.map((i) => i.name).join(', ') || '(empty)'}`));
        }
        process.exitCode = 1;
        return;
      }
      const { lock, invalid } = await readLock(config.root);
      if (invalid) {
        console.error(pc.red('ds.lock is corrupt — restore it from git history before ejecting.'));
        process.exitCode = 1;
        return;
      }
      if (lock?.ejected[componentName]) {
        console.error(pc.red(`'${componentName}' is already ejected (see ds.lock).`));
        process.exitCode = 1;
        return;
      }

      // Snapshot the exact template output as the fork base. The recorded hash +
      // template version are what would make a future `girih forks` 3-way merge.
      const source = renderComponentSource(ir, { classPrefix: config.tokens.prefix, runtimePackage: RUNTIME_PACKAGE });
      const baseFile = emittedFile(`components/ejected/${componentName}.tsx`, source);

      // If the generated file on disk carries hand edits (drift), the fork must
      // start from THOSE — ejecting is the drift gate's own remedy, and following
      // it must never lose the user's work. The recorded base stays pristine.
      const { manifest } = await readManifest(config.root);
      const generatedPath = join(config.targets.react.output, `src/${componentName}.tsx`);
      const onDisk = await readFile(join(config.root, generatedPath), 'utf8').catch(() => null);
      const recorded = manifest?.files[generatedPath.replaceAll('\\', '/')];
      const drifted = onDisk !== null && recorded !== undefined && emittedFile('x', onDisk).hash !== recorded;

      const ejectedPath = baseFile.path;
      const file = drifted ? emittedFile(ejectedPath, onDisk!) : baseFile;
      await writeEmittedFiles(config.root, [file]);
      if (drifted) {
        console.log(pc.yellow(`note: ${generatedPath} had hand edits — they were carried into the fork.`));
      }
      await writeLock(config.root, {
        version: 1,
        ejected: {
          ...lock?.ejected,
          [componentName]: {
            template: ir.template,
            templateVersion: TEMPLATE_REGISTRY[ir.template]?.version ?? 0,
            baseHash: baseFile.hash,
          },
        },
      });

      console.log(`${pc.green('create')}  ${ejectedPath}`);
      console.log(
        `${pc.green('update')}  ds.lock ${pc.dim(`(base: ${ir.template}@v${TEMPLATE_REGISTRY[ir.template]?.version}, ${baseFile.hash.slice(0, 12)})`)}`,
      );
      console.log(`\n'${componentName}' is now yours: edit ${pc.cyan(ejectedPath)} freely — commit it and ds.lock.`);
      console.log(pc.dim('Its spec is still validated and its CSS still generated — only markup/behavior is forked.'));
      console.log(`Run ${pc.cyan('girih generate react')} to stitch it into the package.`);
    });
}
