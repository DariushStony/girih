import pc from 'picocolors';
import { runDoctor } from '../doctor.js';
import type { Command } from 'commander';

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check the environment girih runs in: node, package manager, resolution, build prerequisites.')
    .option('--offline', 'skip the npm registry update check')
    .action(async (options: { offline?: boolean }) => {
      const checks = await runDoctor(process.cwd(), { offline: options.offline ?? false });
      const mark = { ok: pc.green('✔'), warn: pc.yellow('!'), fail: pc.red('✗') };
      const width = Math.max(...checks.map((c) => c.label.length));
      for (const check of checks) {
        console.log(`${mark[check.status]} ${check.label.padEnd(width)}  ${check.status === 'ok' ? pc.dim(check.detail) : check.detail}`);
        if (check.fix) console.log(`  ${' '.repeat(width)}  ${pc.green('fix:')} ${check.fix}`);
      }

      const failed = checks.filter((c) => c.status === 'fail').length;
      const warned = checks.filter((c) => c.status === 'warn').length;
      if (failed > 0) {
        console.log(pc.red(`\n✖ ${failed} problem${failed === 1 ? '' : 's'} will stop girih working here.`));
        process.exitCode = 1;
      } else if (warned > 0) {
        console.log(pc.yellow(`\n⚠ ${warned} thing${warned === 1 ? '' : 's'} worth knowing; nothing blocking.`));
      } else {
        console.log(pc.green('\n✔ environment looks right'));
      }
      // `check` validates the workspace's content; this validates its surroundings.
      console.log(pc.dim('Run `girih check` to validate tokens and contracts.'));
    });
}
