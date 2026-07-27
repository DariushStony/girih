import pc from 'picocolors';
import { emittedFile } from '@faravahar/girih-core';
import { TEMPLATE_REGISTRY, renderComponentSource } from '@faravahar/girih-generator-react';
import { readLock } from '../lock.js';
import { RUNTIME_PACKAGE } from '../self.js';
import { loadComponentIRs, loadWorkspace } from '../workspace.js';
import type { Command } from 'commander';

export function registerForks(program: Command): void {
  program
    .command('forks')
    .description('Report ejected forks that have drifted from the current templates.')
    .action(async () => {
      const workspace = await loadWorkspace();
      if (!workspace) return;
      const { config, build } = workspace;
      const { lock, invalid } = await readLock(config.root);
      if (invalid) {
        console.error(pc.red('ds.lock is corrupt — restore it from git history.'));
        process.exitCode = 1;
        return;
      }
      const ejected = Object.entries(lock?.ejected ?? {});
      if (ejected.length === 0) {
        console.log(pc.green('No ejected components — everything tracks the current templates.'));
        return;
      }
      // Surfacing drift on both axes — template version AND the spec the fork was
      // taken from. The 3-way merge itself is post-MVP; this is the honest report.
      const { irs } = await loadComponentIRs(config, build);
      const byName = new Map(irs.map((ir) => [ir.name, ir]));
      let stale = 0;
      for (const [name, entry] of ejected) {
        const current = TEMPLATE_REGISTRY[entry.template]?.version ?? entry.templateVersion;
        const ir = byName.get(name);
        const rebased = ir
          ? emittedFile('x', renderComponentSource(ir, { classPrefix: config.tokens.prefix, runtimePackage: RUNTIME_PACKAGE })).hash
          : null;
        const reasons: string[] = [];
        if (current > entry.templateVersion) reasons.push(`template ${entry.template} v${entry.templateVersion}→v${current}`);
        if (rebased !== null && rebased !== entry.baseHash) reasons.push('spec changed since eject');
        if (!ir) reasons.push('no matching spec');

        if (reasons.length > 0) {
          stale += 1;
          console.log(`${pc.yellow('outdated')}  ${name} ${pc.dim(`(${reasons.join('; ')})`)}`);
        } else {
          console.log(`${pc.green('current')}   ${name} ${pc.dim(`(${entry.template}@v${entry.templateVersion})`)}`);
        }
      }
      if (stale > 0) {
        console.log(
          pc.dim(
            `\n${stale} fork(s) no longer match their recorded base. Review them against the current template/spec, or remove the ds.lock entry and re-eject. (Automated 3-way merge is planned.)`,
          ),
        );
      }
    });
}
