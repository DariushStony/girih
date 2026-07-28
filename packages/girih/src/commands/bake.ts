import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import pc from 'picocolors';
import { hasErrors, verifyEmittedFiles } from '@faravahar/girih-core';
import { generateCss } from '@faravahar/girih-generator-css';
import { TEMPLATE_REGISTRY } from '@faravahar/girih-generator-react';
import { buildPackage } from '../build.js';
import { readLock, writeLock } from '../lock.js';
import { printDiagnostics } from '../output.js';
import { applyBump, computeSignature, diffSignatures } from '../semver.js';
import { composeReact, loadWorkspace } from '../workspace.js';
import type { Command } from 'commander';

export function registerBake(program: Command): void {
  program
    .command('bake')
    .description('Version the design system from its contract diff and stage it for you to publish.')
    .option('--check', 'report the pending version bump without staging or committing it')
    .action(async (options: { check?: boolean }) => {
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
      if (hasErrors(build.diagnostics)) {
        printDiagnostics(build.diagnostics);
        process.exitCode = 1;
        return;
      }

      const outputBase = config.targets.react.output;
      const outDir = join(config.root, outputBase);
      const stale = await verifyEmittedFiles(outDir, composed.files);
      if (stale.length > 0) {
        console.error(pc.red('Refusing to bake stale output — run `girih generate react` first.'));
        process.exitCode = 1;
        return;
      }

      // Semver from the contract diff — not from a human guess.
      const { lock } = await readLock(config.root);
      const signature = computeSignature({
        graphs: build.graphs,
        irs: composed.irs,
        extensions: composed.extensions,
        templateVersions: Object.fromEntries(Object.entries(TEMPLATE_REGISTRY).map(([name, caps]) => [name, caps.version])),
        ejected: composed.ejected,
        files: composed.files,
      });
      const previous = lock?.published;
      const diff = diffSignatures(previous?.signature ?? null, signature);
      if (diff.bump === 'none') {
        console.log(pc.green(`✔ no contract changes since ${previous?.version ?? '(unbaked)'} — nothing to bake.`));
        return;
      }
      const nextVersion = applyBump(previous?.version ?? '0.0.0', diff.bump);

      console.log(
        `${pc.bold(config.name)}  ${pc.dim(previous?.version ?? '(unbaked)')} → ${pc.bold(nextVersion)}  ${pc.cyan(`[${diff.bump}]`)}`,
      );
      for (const reason of diff.reasons.slice(0, 12)) console.log(`  ${pc.dim(reason)}`);
      if (diff.reasons.length > 12) console.log(pc.dim(`  …and ${diff.reasons.length - 12} more`));

      if (options.check) {
        console.log(pc.yellow(`\nRun \`girih bake\` to stage ${nextVersion} into .ds/baked and commit it as the new baseline.`));
        process.exitCode = 1;
        return;
      }

      const built = await buildPackage(outDir);
      build.diagnostics.push(...built.diagnostics);
      if (hasErrors(built.diagnostics)) {
        printDiagnostics(build.diagnostics);
        console.error(pc.red('\nBuild failed — not baking.'));
        process.exitCode = 1;
        return;
      }

      // Stage the exact publishable tree in .ds/baked so the tracked workspace never
      // goes dirty (no manifest drift) — only the staged package.json carries the
      // computed version. It persists (unlike the old npm-publish staging) since it is
      // now the artifact itself: whatever you publish it with reads from here.
      const staging = join(config.root, '.ds/baked');
      await rm(staging, { recursive: true, force: true });
      await mkdir(staging, { recursive: true });
      for (const dir of ['dist', 'styles']) await cp(join(outDir, dir), join(staging, dir), { recursive: true });
      const readmePath = join(outDir, 'README.md');
      if (existsSync(readmePath)) await cp(readmePath, join(staging, 'README.md'));
      await writeFile(
        join(staging, 'package.json'),
        bumpPackageVersion(await readFile(join(outDir, 'package.json'), 'utf8'), nextVersion),
        'utf8',
      );

      // Baking is the commit point: there is no further "did it actually publish"
      // confirmation to gate on once girih itself no longer calls npm.
      await writeLock(config.root, { version: 1, ejected: lock?.ejected ?? {}, published: { version: nextVersion, signature } });

      // A scoped package's first publish is private-by-default on npm and needs
      // --access public — mentioned only for a first bake, since that's the specific
      // case that trips people up.
      const scoped = config.name.startsWith('@');
      console.log(`\n${pc.green('baked')} ${config.name}@${nextVersion} → ${pc.cyan('.ds/baked')}`);
      console.log(pc.dim(`Publish it however you like, e.g. \`npm publish .ds/baked${scoped && !previous ? ' --access public' : ''}\`.`));
      console.log(pc.dim('Run `girih generate react` to sync the workspace package.json to the new version.'));
    });
}

/** Rewrite only the version field, leaving the rest of the manifest byte-identical. */
function bumpPackageVersion(source: string, nextVersion: string): string {
  return source.replace(/("version":\s*")[^"]*(")/, `$1${nextVersion}$2`);
}
