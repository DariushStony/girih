#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { CONFIG_FILENAMES, emittedFile, loadConfig, verifyEmittedFiles, writeEmittedFiles } from '@girih/core';
import type { EmittedFile, ResolvedConfig } from '@girih/core';
import { buildTokenGraphs } from '@girih/tokens';
import type { TokenBuildResult } from '@girih/tokens';
import { generateCss } from '@girih/generator-css';
import { generateReact, renderComponentSource, TEMPLATE_REGISTRY } from '@girih/generator-react';
import { loadExtensions, loadSpecs, specToIR, validateExtensions, validateSpecs } from '@girih/spec';
import type { ComponentIR, LoadedExtension } from '@girih/spec';
import { spawnSync } from 'node:child_process';
import { buildPackage } from './build.js';
import { readLock, writeLock } from './lock.js';
import { detectDrift, planManifestUpdate, readManifest, writeManifest } from './manifest.js';
import { printDiagnostics, printSummaryLine, table } from './output.js';
import { scaffoldWorkspace } from './scaffold.js';
import { applyBump, computeSignature, diffSignatures } from './semver.js';

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

/** Load + cross-validate component specs and extensions; diagnostics land on the build. */
async function loadComponentIRs(
  config: ResolvedConfig,
  build: TokenBuildResult,
): Promise<{ irs: ComponentIR[]; extensions: LoadedExtension[] }> {
  const loaded = await loadSpecs(config);
  build.diagnostics.push(...loaded.diagnostics);
  const irs = loaded.specs.map(({ spec, file }) => {
    const { ir, diagnostics } = specToIR(spec);
    ir.sourceFile = file;
    build.diagnostics.push(...diagnostics.map((d) => ({ ...d, file: d.file ?? file })));
    return ir;
  });
  build.diagnostics.push(...validateSpecs(irs, build.graphs, TEMPLATE_REGISTRY));

  const { extensions, diagnostics } = await loadExtensions(config);
  build.diagnostics.push(...diagnostics);
  build.diagnostics.push(...validateExtensions(extensions, irs, build.graphs));
  return { irs, extensions };
}

/** Ejected sources from ds.lock, read from components/ejected/, cross-checked against the catalog. */
async function loadEjectedSources(
  config: ResolvedConfig,
  build: TokenBuildResult,
  irs: ComponentIR[],
): Promise<Record<string, string>> {
  const { lock, invalid } = await readLock(config.root);
  if (invalid) {
    build.diagnostics.push({
      code: 'GIRIH1013',
      severity: 'error',
      message: 'ds.lock is corrupt or from an incompatible girih version.',
      file: 'ds.lock',
      help: 'ds.lock is machine-managed and committed — restore it from git history.',
    });
    return {};
  }
  const sources: Record<string, string> = {};
  const byName = new Map(irs.map((ir) => [ir.name, ir]));
  for (const [name, entry] of Object.entries(lock?.ejected ?? {})) {
    const ir = byName.get(name);
    if (!ir) {
      build.diagnostics.push({
        code: 'GIRIH1015',
        severity: 'warning',
        message: `ds.lock records '${name}' as ejected, but no spec with that name exists — the fork is not generated.`,
        file: 'ds.lock',
        help: `Restore components/${name.charAt(0).toLowerCase()}${name.slice(1)}.spec.ts, or remove the entry and components/ejected/${name}.tsx.`,
      });
      continue;
    }
    const path = `components/ejected/${name}.tsx`;
    const contents = await readFile(join(config.root, path), 'utf8').catch(() => null);
    if (contents === null) {
      build.diagnostics.push({
        code: 'GIRIH1012',
        severity: 'error',
        message: `'${name}' is recorded as ejected in ds.lock, but ${path} is missing.`,
        file: 'ds.lock',
        help: `Restore the file, or remove the '${name}' entry from ds.lock to return to generation.`,
      });
      continue;
    }
    sources[name] = contents;

    // The fork's base is frozen; the spec/template are not. Make divergence visible.
    const currentRender = emittedFile('x', renderComponentSource(ir, { classPrefix: config.tokens.prefix, runtimePackage: '@girih/react-runtime' }));
    if (currentRender.hash !== entry.baseHash) {
      build.diagnostics.push({
        code: 'GIRIH1014',
        severity: 'warning',
        message: `'${name}' was ejected from a different spec/template than the current one — the fork may not honor the contract anymore.`,
        file: path,
        help: 'Review the fork against the current spec, or re-eject after removing the ds.lock entry (girih update will automate this in M6).',
      });
    }
  }
  return sources;
}

interface ComposedReact {
  files: EmittedFile[];
  irFiles: EmittedFile[];
  irs: ComponentIR[];
  extensions: LoadedExtension[];
  /** Component name → user-owned ejected source that was stitched in. */
  ejected: Record<string, string>;
}

/**
 * The single source of truth for what `girih generate react` writes: CSS under
 * styles/, the React package, and canonical IR. Shared by generate, build, and
 * publish so they can never disagree about the output.
 */
async function composeReact(config: ResolvedConfig, build: TokenBuildResult, cssFiles: EmittedFile[]): Promise<ComposedReact> {
  const { irs, extensions } = await loadComponentIRs(config, build);
  const ejected = await loadEjectedSources(config, build, irs);
  // The package.json version mirrors the last published version (from ds.lock),
  // never a stale hand-set value — so generate/build/publish agree byte-for-byte.
  const { lock } = await readLock(config.root);
  const version = lock?.published?.version ?? '0.0.0-dev';
  const reactResult = generateReact(irs, { packageName: config.name, prefix: config.tokens.prefix, version }, { extensions, ejected });
  build.diagnostics.push(...reactResult.diagnostics);
  return {
    files: [...cssFiles.map((f) => ({ ...f, path: join('styles', f.path) })), ...reactResult.files],
    // Canonical IR — the language-neutral contract form future targets (Figma) consume.
    irFiles: irs.map((ir) => emittedFile(`${ir.name}.json`, JSON.stringify(ir, null, 2) + '\n')),
    irs,
    extensions,
    ejected,
  };
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
          pc.red(`'${componentName}' is an extension (${extension.file}) — extensions are pure data and always regenerated; edit the .ext.ts instead of ejecting.`),
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
    // template version are what make a future `girih update` a 3-way merge.
    const source = renderComponentSource(ir, { classPrefix: config.tokens.prefix, runtimePackage: '@girih/react-runtime' });
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
        ...(lock?.ejected ?? {}),
        [componentName]: {
          template: ir.template,
          templateVersion: TEMPLATE_REGISTRY[ir.template]?.version ?? 0,
          baseHash: baseFile.hash,
        },
      },
    });

    console.log(`${pc.green('create')}  ${ejectedPath}`);
    console.log(`${pc.green('update')}  ds.lock ${pc.dim(`(base: ${ir.template}@v${TEMPLATE_REGISTRY[ir.template]?.version}, ${baseFile.hash.slice(0, 12)})`)}`);
    console.log(`\n'${componentName}' is now yours: edit ${pc.cyan(ejectedPath)} freely — commit it and ds.lock.`);
    console.log(pc.dim('Its spec is still validated and its CSS still generated — only markup/behavior is forked.'));
    console.log(`Run ${pc.cyan('girih generate react')} to stitch it into the package.`);
  });

program
  .command('build')
  .description('Compile the generated React package into publishable dist/ (ESM + .d.ts).')
  .action(async () => {
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
      console.error(pc.red(`The generated package is out of date — run \`girih generate react\` before building.`));
      for (const path of stale) console.error(`  ${pc.dim(join(outputBase, path))}`);
      process.exitCode = 1;
      return;
    }

    const result = await buildPackage(outDir);
    build.diagnostics.push(...result.diagnostics);
    if (result.diagnostics.some((d) => d.severity === 'error')) {
      printDiagnostics(build.diagnostics);
      console.error(pc.red('\nBuild failed.'));
      process.exitCode = 1;
      return;
    }
    const js = result.files.filter((f) => f.path.endsWith('.js')).length;
    const dts = result.files.filter((f) => f.path.endsWith('.d.ts')).length;
    console.log(`${pc.green('build')}  ${join(outputBase, 'dist')} ${pc.dim(`(${js} module${js === 1 ? '' : 's'} + ${dts} declaration${dts === 1 ? '' : 's'})`)}`);
    printDiagnostics(build.diagnostics.filter((d) => d.severity !== 'info'));
  });

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

    console.log(`${pc.bold(config.name)}  ${pc.dim(previous?.version ?? '(unpublished)')} → ${pc.bold(nextVersion)}  ${pc.cyan(`[${diff.bump}]`)}`);
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
    await writeFile(join(staging, 'package.json'), bumpPackageVersion(await readFile(join(outDir, 'package.json'), 'utf8'), nextVersion), 'utf8');

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

program
  .command('update')
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
        ? emittedFile('x', renderComponentSource(ir, { classPrefix: config.tokens.prefix, runtimePackage: '@girih/react-runtime' })).hash
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
        pc.dim(`\n${stale} fork(s) no longer match their recorded base. Review them against the current template/spec, or remove the ds.lock entry and re-eject. (Automated 3-way merge is planned.)`),
      );
    }
  });

function bumpPackageVersion(source: string, version: string): string {
  return source.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`);
}

function formatValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 48 ? `${text.slice(0, 45)}…` : text;
}

await program.parseAsync(process.argv);
