import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import pc from 'picocolors';
import { workspaceGirihDependencies } from '../doctor.js';
import { table } from '../output.js';
import { detectPackageManager } from '../package-manager.js';
import { fetchLatestVersions, updateChecksDisabled } from '../registry.js';
import { installedVersion } from '../resolve.js';
import type { Command } from 'commander';

export function registerUpdate(program: Command): void {
  program
    .command('update')
    .description('Upgrade the girih packages in this workspace to their latest published versions.')
    .option('--check', 'report what is outdated without installing')
    .action(async (options: { check?: boolean }) => {
      const cwd = process.cwd();
      if (!existsSync(join(cwd, 'package.json'))) {
        console.error(pc.red('No package.json here — run this from the root of your workspace.'));
        process.exitCode = 1;
        return;
      }

      const declared = await workspaceGirihDependencies(cwd);
      const names = Object.keys(declared);
      if (names.length === 0) {
        console.log(pc.green('No girih packages declared here — nothing to update.'));
        console.log(pc.dim('(Inside the girih monorepo the ranges are `workspace:*`, which this command leaves alone.)'));
        return;
      }

      const latest = await fetchLatestVersions(names, { force: true });
      if (Object.keys(latest).length === 0) {
        // Every name failing looks the same whether the network is down or none of
        // them are published, so name both rather than guessing.
        console.error(pc.red(`No versions found for any of: ${names.join(', ')}.`));
        console.error(pc.dim('The registry may be unreachable, or these packages may not be published.'));
        if (updateChecksDisabled()) console.error(pc.dim('GIRIH_NO_UPDATE_CHECK is set — unset it for this command.'));
        process.exitCode = 1;
        return;
      }

      const rows: string[][] = [];
      const outdated: string[] = [];
      for (const name of names) {
        const current = installedVersion(cwd, name);
        const newest = latest[name];
        const stale = newest !== undefined && current !== null && current !== newest;
        if (stale || (newest !== undefined && current === null)) outdated.push(`${name}@${newest}`);
        rows.push([
          pc.cyan(name),
          current ?? pc.red('not installed'),
          newest ?? pc.dim('unknown'),
          stale ? pc.yellow('outdated') : current === null ? pc.red('missing') : pc.green('current'),
        ]);
      }
      console.log(table(rows, ['PACKAGE', 'INSTALLED', 'LATEST', '']));

      if (outdated.length === 0) {
        console.log(pc.green('\n✔ every girih package is current.'));
        return;
      }
      if (options.check) {
        console.log(pc.yellow(`\n${outdated.length} package(s) outdated — run \`girih update\` to upgrade.`));
        process.exitCode = 1;
        return;
      }

      const packageManager = detectPackageManager();
      // `add` (not `install`) so the declared ranges are rewritten too — otherwise the
      // next clean install would silently pull the old versions back.
      const args = packageManager === 'npm' ? ['install', '--save-dev', ...outdated] : ['add', '--save-dev', ...outdated];
      console.log(pc.dim(`\n$ ${packageManager} ${args.join(' ')}`));
      const result = spawnSync(packageManager, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
      if (result.status !== 0) {
        console.error(pc.red(`\n${packageManager} failed (exit ${result.status}).`));
        process.exitCode = result.status ?? 1;
        return;
      }
      console.log(pc.green(`\n✔ upgraded ${outdated.length} package(s).`));
      console.log(pc.dim('Run `girih check` and `girih generate react --check` to confirm nothing drifted.'));
    });
}
