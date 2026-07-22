#!/usr/bin/env node
import { join } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { loadConfig, verifyEmittedFiles, writeEmittedFiles } from '@girih/core';
import type { EmittedFile, ResolvedConfig } from '@girih/core';
import { buildTokenGraphs } from '@girih/tokens';
import type { TokenBuildResult } from '@girih/tokens';
import { generateCss } from '@girih/generator-css';
import { generateReact } from '@girih/generator-react';
import { loadSpecs, specToIR, validateSpecs } from '@girih/spec';
import type { ComponentIR } from '@girih/spec';
import { printDiagnostics, printSummaryLine, table } from './output.js';

const program = new Command();
program.name('girih').description('Compile a multi-brand design system from tokens and component contracts.');

async function loadWorkspace(): Promise<{ config: ResolvedConfig; build: TokenBuildResult } | null> {
  const { config, diagnostics } = await loadConfig(process.cwd());
  if (!config) {
    printDiagnostics(diagnostics);
    process.exitCode = 1;
    return null;
  }
  const build = await buildTokenGraphs(config);
  build.diagnostics.unshift(...diagnostics);
  return { config, build };
}

/** Load + cross-validate component specs; diagnostics land on the build. */
async function loadComponentIRs(config: ResolvedConfig, build: TokenBuildResult): Promise<ComponentIR[]> {
  const loaded = await loadSpecs(config);
  build.diagnostics.push(...loaded.diagnostics);
  const irs = loaded.specs.map(({ spec, file }) => {
    const { ir, diagnostics } = specToIR(spec);
    ir.sourceFile = file;
    build.diagnostics.push(...diagnostics.map((d) => ({ ...d, file: d.file ?? file })));
    return ir;
  });
  build.diagnostics.push(...validateSpecs(irs, build.graphs));
  return irs;
}

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

    const irs = await loadComponentIRs(config, build);

    const tiers = { global: 0, semantic: 0, component: 0 };
    for (const token of build.base.tokens.values()) tiers[token.tier] += 1;
    if (irs.length > 0) {
      console.log(`${pc.bold(String(irs.length))} component contract${irs.length === 1 ? '' : 's'}: ${irs.map((ir) => ir.name).join(', ')}`);
    }
    console.log(
      `${pc.bold(String(build.base.tokens.size))} tokens ` +
        pc.dim(`(${tiers.global} global, ${tiers.semantic} semantic, ${tiers.component} component)`) +
        ` · ${pc.bold(String(build.graphs.size))} brands: ` +
        [...build.graphs.keys()]
          .map((brand) => {
            const overrides = build.overrides.get(brand)?.length ?? 0;
            const suffix = brand === config.brands.default ? ' (default)' : overrides > 0 ? ` (${overrides} overrides)` : '';
            return `${brand}${pc.dim(suffix)}`;
          })
          .join(', '),
    );

    printDiagnostics(build.diagnostics);
    printSummaryLine(build.diagnostics);
    if (build.diagnostics.some((d) => d.severity === 'error')) process.exitCode = 1;
  });

program
  .command('generate')
  .argument('[target]', 'what to generate (css)', 'css')
  .option('--check', 'verify the generated output on disk is up to date instead of writing')
  .description('Generate design system artifacts from the workspace definition.')
  .action(async (target: string, options: { check?: boolean }) => {
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
    if (target === 'react') {
      const irs = await loadComponentIRs(config, build);
      if (build.diagnostics.some((d) => d.severity === 'error')) {
        printDiagnostics(build.diagnostics);
        printSummaryLine(build.diagnostics);
        console.error(pc.red('\nRefusing to generate from invalid component specs.'));
        process.exitCode = 1;
        return;
      }
      const reactResult = generateReact(irs, {
        packageName: config.name,
        prefix: config.tokens.prefix,
      });
      build.diagnostics.push(...reactResult.diagnostics);
      outputBase = config.targets.react.output;
      files = [
        ...cssResult.files.map((f) => ({ ...f, path: join('styles', f.path) })),
        ...reactResult.files,
      ];
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
      for (const path of stale) console.log(`${pc.red('stale')}  ${join(outputBase, path)}`);
      if (stale.length > 0) {
        console.error(pc.red(`\n${stale.length} file(s) out of date — run \`girih generate ${target}\`.`));
        process.exitCode = 1;
      } else {
        console.log(pc.green('✔ generated output is up to date'));
      }
    } else {
      await writeEmittedFiles(outDir, files);
      for (const file of files) {
        console.log(`${pc.green('write')}  ${join(outputBase, file.path)} ${pc.dim(`(${file.contents.length} bytes)`)}`);
      }
    }

    printDiagnostics(build.diagnostics.filter((d) => d.severity !== 'info'));
    if (build.diagnostics.some((d) => d.severity === 'error')) process.exitCode = 1;
  });

for (const [name, milestone] of [
  ['init', 'M4'],
  ['brand', 'M4'],
  ['eject', 'M5'],
  ['publish', 'M6'],
  ['update', 'M6'],
] as const) {
  program
    .command(name)
    .allowUnknownOption(true)
    .description(`(planned for ${milestone})`)
    .action(() => {
      console.log(pc.yellow(`'girih ${name}' is planned for milestone ${milestone} — not implemented yet.`));
    });
}

function formatValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 48 ? `${text.slice(0, 45)}…` : text;
}

await program.parseAsync(process.argv);
