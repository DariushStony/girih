#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { CONFIG_FILENAMES, emittedFile, loadConfig, verifyEmittedFiles, writeEmittedFiles } from '@girih/core';
import type { EmittedFile, ResolvedConfig } from '@girih/core';
import { buildTokenGraphs } from '@girih/tokens';
import type { TokenBuildResult } from '@girih/tokens';
import { generateCss } from '@girih/generator-css';
import { generateReact } from '@girih/generator-react';
import { loadSpecs, specToIR, validateSpecs } from '@girih/spec';
import type { ComponentIR } from '@girih/spec';
import { detectDrift, planManifestUpdate, readManifest, writeManifest } from './manifest.js';
import { printDiagnostics, printSummaryLine, table } from './output.js';
import { scaffoldWorkspace } from './scaffold.js';

const program = new Command();
program.name('girih').description('Compile a multi-brand design system from tokens and component contracts.');

const BRAND_NAME = /^[a-z][a-z0-9-]*$/;
const PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** Can ds.config.ts's `import '@girih/cli'` resolve from this directory? */
function hasResolvableCli(cwd: string): boolean {
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'node_modules/@girih/cli/package.json'))) return true;
    if (dir === dirname(dir)) return false;
  }
}

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
  .command('init')
  .description('Scaffold a girih workspace in the current directory.')
  .option('--name <package>', 'published package name (default: @<dir>/design-system)')
  .option('--brand <name>', 'default brand name', 'main')
  .action(async (options: { name?: string; brand: string }) => {
    const cwd = process.cwd();
    const existing = CONFIG_FILENAMES.find((f) => existsSync(join(cwd, f)));
    if (existing) {
      console.error(pc.red(`${existing} already exists here — refusing to scaffold over a workspace.`));
      process.exitCode = 1;
      return;
    }
    for (let ancestor = dirname(cwd); ancestor !== dirname(ancestor); ancestor = dirname(ancestor)) {
      if (CONFIG_FILENAMES.some((f) => existsSync(join(ancestor, f)))) {
        console.log(pc.yellow(`note: ${ancestor} is already a girih workspace — you are creating a nested one.`));
        break;
      }
    }

    if (!BRAND_NAME.test(options.brand)) {
      console.error(pc.red(`Brand name '${options.brand}' must be lowercase kebab-case (it becomes a [data-brand] selector).`));
      process.exitCode = 1;
      return;
    }
    const name = options.name ?? `@${basename(cwd)}/design-system`;
    if (!PACKAGE_NAME.test(name)) {
      console.error(pc.red(`'${name}' is not a valid npm package name.`));
      if (!options.name) console.error(pc.dim(`(derived from the directory name — pass --name @scope/design-system explicitly)`));
      process.exitCode = 1;
      return;
    }

    const { written } = await scaffoldWorkspace(cwd, { name, brand: options.brand });
    for (const path of written) console.log(`${pc.green('create')}  ${path}`);
    console.log(`\n${pc.bold(name)} is ready. Next steps:`);
    if (!hasResolvableCli(cwd)) {
      console.log(`  ${pc.cyan('npm install -D @girih/cli')}   (ds.config.ts imports it)`);
    }
    console.log(`  ${pc.cyan('girih check')}           validate tokens and contracts`);
    console.log(`  ${pc.cyan('girih generate react')}  compile the design system package`);
    console.log(`  ${pc.cyan('open demo/index.html')}  see every variant, size, and brand`);
    console.log(`  ${pc.cyan('girih brand create <name>')}  add a brand overlay`);
  });

program
  .command('brand')
  .description('Manage brand overlays.')
  .command('create <name>')
  .description('Add a brand overlay and register it in ds.config.ts.')
  .action(async (name: string) => {
    const { config, diagnostics } = await loadConfig(process.cwd());
    if (!config) {
      printDiagnostics(diagnostics);
      process.exitCode = 1;
      return;
    }
    if (config.brands.all.some((b) => b.name === name)) {
      console.error(pc.red(`Brand '${name}' already exists.`));
      process.exitCode = 1;
      return;
    }
    if (!BRAND_NAME.test(name)) {
      console.error(pc.red(`Brand name '${name}' must be lowercase kebab-case (it becomes a [data-brand] selector).`));
      process.exitCode = 1;
      return;
    }

    const overlayPath = `brands/${name}/tokens.json`;
    if (existsSync(join(config.root, overlayPath))) {
      console.log(`${pc.yellow('keep')}    ${overlayPath} ${pc.dim('(already exists — not overwritten)')}`);
    } else {
      await writeEmittedFiles(config.root, [emittedFile(overlayPath, '{}\n')]);
      console.log(`${pc.green('create')}  ${overlayPath}`);
    }

    // Conservative auto-registration: insert right after `definitions: {`.
    // Keys are quoted so kebab-case brand names stay valid TypeScript.
    // If the config was reformatted beyond recognition, print the snippet instead.
    const configPath = join(config.root, 'ds.config.ts');
    const source = await readFile(configPath, 'utf8');
    const match = source.match(/definitions:\s*\{\n(\s*)/);
    const snippet = `'${name}': { tokens: '${overlayPath}' },`;
    if (match) {
      const insertAt = match.index! + match[0].length;
      await writeFile(configPath, `${source.slice(0, insertAt - match[1]!.length)}${match[1]}${snippet}\n${match[1]}${source.slice(insertAt)}`, 'utf8');
      console.log(`${pc.green('update')}  ds.config.ts ${pc.dim(`(registered '${name}')`)}`);
    } else {
      console.log(pc.yellow(`Could not safely edit ds.config.ts — add this under brands.definitions yourself:`));
      console.log(`  ${snippet}`);
    }
    console.log(`\nOverride tokens in ${pc.cyan(overlayPath)} (values only — new paths are rejected), then regenerate.`);
  });

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
      // Canonical IR — the language-neutral contract form future targets (Figma) consume.
      irFiles = irs.map((ir) => emittedFile(`${ir.name}.json`, JSON.stringify(ir, null, 2) + '\n'));
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
        console.log(`${pc.green('write')}  ${join(outputBase, file.path)} ${pc.dim(`(${file.contents.length} bytes)`)}`);
      }
      if (irFiles.length > 0) {
        console.log(`${pc.green('write')}  .ds/ir/ ${pc.dim(`(${irFiles.length} component IR file${irFiles.length === 1 ? '' : 's'})`)}`);
      }
      if (target === 'react' && existsSync(join(config.root, 'demo/index.html'))) {
        console.log(`\nPreview: ${pc.cyan('open demo/index.html')} · usage: ${pc.cyan(join(outputBase, 'README.md'))}`);
      }
    }

    printDiagnostics(build.diagnostics.filter((d) => d.severity !== 'info'));
    if (build.diagnostics.some((d) => d.severity === 'error')) process.exitCode = 1;
  });

for (const [name, milestone] of [
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
