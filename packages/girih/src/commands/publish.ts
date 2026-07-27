import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import pc from 'picocolors';
import { verifyEmittedFiles } from '@faravahar/girih-core';
import { generateCss } from '@faravahar/girih-generator-css';
import { TEMPLATE_REGISTRY } from '@faravahar/girih-generator-react';
import { buildPackage } from '../build.js';
import { readLock, writeLock } from '../lock.js';
import { printDiagnostics } from '../output.js';
import { applyBump, computeSignature, diffSignatures } from '../semver.js';
import { composeReact, loadWorkspace } from '../workspace.js';
import type { Command } from 'commander';

export function registerPublish(program: Command): void {
  program
    .command('publish')
    .description('Version the design system from its contract diff and publish it to npm.')
    .option('--yes', 'actually run `npm publish` (default is a dry run)')
    .option('--tag <dist-tag>', 'npm dist-tag', 'latest')
    .option('--access <level>', "npm access for scoped packages ('public' or 'restricted')")
    .action(async (options: { yes?: boolean; tag: string; access?: string }) => {
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
        console.error(pc.red('Refusing to publish stale output — run `girih generate react` first.'));
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
        console.log(pc.green(`✔ no contract changes since ${previous?.version ?? '(unpublished)'} — nothing to publish.`));
        return;
      }
      const nextVersion = applyBump(previous?.version ?? '0.0.0', diff.bump);

      console.log(
        `${pc.bold(config.name)}  ${pc.dim(previous?.version ?? '(unpublished)')} → ${pc.bold(nextVersion)}  ${pc.cyan(`[${diff.bump}]`)}`,
      );
      for (const reason of diff.reasons.slice(0, 12)) console.log(`  ${pc.dim(reason)}`);
      if (diff.reasons.length > 12) console.log(pc.dim(`  …and ${diff.reasons.length - 12} more`));

      const built = await buildPackage(outDir);
      build.diagnostics.push(...built.diagnostics);
      if (built.diagnostics.some((d) => d.severity === 'error')) {
        printDiagnostics(build.diagnostics);
        console.error(pc.red('\nBuild failed — not publishing.'));
        process.exitCode = 1;
        return;
      }

      // Stage the exact publishable tree in .ds/publish so the tracked workspace
      // never goes dirty (no manifest drift) — only staged package.json carries the
      // computed version. npm publishes the staging directory.
      const staging = join(config.root, '.ds/publish');
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

      // A scoped package's FIRST publish is private-by-default and fails without
      // --access public — and `--dry-run` never surfaces that, so make it explicit.
      const access = options.access ?? config.publish.access;
      const scoped = config.name.startsWith('@');
      if (scoped && !previous && access !== 'public') {
        console.error(
          pc.red(`\n'${config.name}' is scoped and has never been published — npm defaults it to restricted, which needs a paid plan.`),
        );
        console.error(pc.dim("Pass --access public (or set publish.access: 'public' in ds.config.ts) for an open-source design system."));
        process.exitCode = 1;
        return;
      }

      const npmArgs = [
        'publish',
        staging,
        '--tag',
        options.tag,
        ...(scoped ? ['--access', access] : []),
        ...(options.yes ? [] : ['--dry-run']),
      ];
      console.log(pc.dim(`\n$ npm ${npmArgs.slice(0, 1).concat('.ds/publish', npmArgs.slice(2)).join(' ')}`));
      const npm = spawnSync('npm', npmArgs, { cwd: config.root, stdio: 'inherit', shell: process.platform === 'win32' });
      await rm(staging, { recursive: true, force: true });
      if (npm.status !== 0) {
        console.error(pc.red(`\nnpm publish failed (exit ${npm.status}).`));
        process.exitCode = npm.status ?? 1;
        return;
      }

      if (options.yes) {
        // Record the new baseline only when the publish actually happened. The next
        // `girih generate react` stamps this version into the tracked package.json.
        await writeLock(config.root, { version: 1, ejected: lock?.ejected ?? {}, published: { version: nextVersion, signature } });
        console.log(`${pc.green('published')} ${config.name}@${nextVersion} · ${pc.green('update')} ds.lock baseline`);
        console.log(pc.dim('Run `girih generate react` to sync the workspace package.json to the new version.'));
      } else {
        console.log(pc.yellow(`\nDry run — nothing published, workspace unchanged. Re-run with --yes to publish ${nextVersion}.`));
      }
    });
}

/** Rewrite only the version field, leaving the rest of the manifest byte-identical. */
function bumpPackageVersion(source: string, nextVersion: string): string {
  return source.replace(/("version":\s*")[^"]*(")/, `$1${nextVersion}$2`);
}
