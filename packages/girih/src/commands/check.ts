import pc from 'picocolors';
import { detectDrift, readManifest } from '../manifest.js';
import { printDiagnostics, printSummaryLine, table } from '../output.js';
import { formatValue, loadComponentIRs, loadEjectedSources, loadWorkspace } from '../workspace.js';
import type { Command } from 'commander';
import type { ComponentIR } from '@faravahar/girih-spec';

export function registerCheck(program: Command): void {
  program
    .command('check')
    .description('Validate tokens, brands, and (later) component contracts.')
    .option('--brand <name>', 'brand used for the resolved-value column (default: the default brand)')
    .option('--no-table', 'skip the resolved token table')
    .action(async (options: { brand?: string; table: boolean }) => {
      const workspace = await loadWorkspace();
      if (!workspace) return;
      const { config, build } = workspace;

      const brandName = options.brand ?? config.brands.default;
      const graph = build.graphs.get(brandName);
      if (options.brand && !graph) {
        build.diagnostics.push({
          code: 'GIRIH1008',
          severity: 'error',
          message: `Unknown brand '${options.brand}'.`,
          help: `Known brands: ${[...build.graphs.keys()].join(', ')}.`,
        });
      }

      if (options.table && graph) {
        const rows = [...graph.tokens.values()].map((token) => [
          pc.cyan(token.path),
          token.tier,
          token.type ?? pc.dim('—'),
          token.resolvedValue === undefined ? pc.red('unresolved') : formatValue(token.resolvedValue),
        ]);
        console.log(table(rows, ['TOKEN', 'TIER', 'TYPE', `RESOLVED (${brandName})`]));
        console.log();
      }

      const { irs, extensions } = await loadComponentIRs(config, build);
      const ejectedSources = await loadEjectedSources(config, build, irs);

      const tiers = { global: 0, semantic: 0, component: 0 };
      for (const token of build.base.tokens.values()) tiers[token.tier] += 1;
      if (irs.length > 0) {
        const describe = (ir: ComponentIR) => (ejectedSources[ir.name] !== undefined ? `${ir.name} ${pc.yellow('(ejected)')}` : ir.name);
        console.log(`${pc.bold(String(irs.length))} component contract${irs.length === 1 ? '' : 's'}: ${irs.map(describe).join(', ')}`);
      }
      if (extensions.length > 0) {
        console.log(
          `${pc.bold(String(extensions.length))} extension${extensions.length === 1 ? '' : 's'}: ${extensions
            .map(({ extension }) => `${extension.name} → ${extension.extends}`)
            .join(', ')}`,
        );
      }
      console.log(
        `${pc.bold(String(build.base.tokens.size))} tokens ` +
          pc.dim(`(${tiers.global} global, ${tiers.semantic} semantic, ${tiers.component} component)`) +
          ` · ${pc.bold(String(build.graphs.size))} brand${build.graphs.size === 1 ? '' : 's'}: ` +
          [...build.graphs.keys()]
            .map((brand) => {
              const overrides = build.overrides.get(brand)?.length ?? 0;
              const suffix = brand === config.brands.default ? ' (default)' : overrides > 0 ? ` (${overrides} overrides)` : '';
              return `${brand}${pc.dim(suffix)}`;
            })
            .join(', '),
      );

      const { manifest, invalid } = await readManifest(config.root);
      if (invalid) {
        build.diagnostics.push({
          code: 'GIRIH1011',
          severity: 'warning',
          message: '.ds/manifest.json is corrupt or from an incompatible girih version — drift detection is disabled.',
          help: 'Delete .ds/manifest.json and regenerate.',
        });
      }
      for (const path of await detectDrift(config.root, manifest)) {
        build.diagnostics.push({
          code: 'GIRIH1010',
          severity: 'warning',
          message: `Generated file ${path} was edited by hand since the last \`girih generate\`.`,
          help: 'Undo the edit or eject the component (M5); the next generate will refuse to overwrite it.',
        });
      }

      printDiagnostics(build.diagnostics);
      printSummaryLine(build.diagnostics);
      if (build.diagnostics.some((d) => d.severity === 'error')) process.exitCode = 1;
    });
}
