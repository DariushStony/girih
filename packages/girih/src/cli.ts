#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { CONFIG_FILENAMES, emittedFile, loadConfig, verifyEmittedFiles, writeEmittedFiles } from '@faravahar/girih-core';
import type { EmittedFile, ResolvedConfig } from '@faravahar/girih-core';
import { buildTokenGraphs } from '@faravahar/girih-tokens';
import type { TokenBuildResult } from '@faravahar/girih-tokens';
import { generateCss } from '@faravahar/girih-generator-css';
import { generateReact, renderComponentSource, TEMPLATE_REGISTRY } from '@faravahar/girih-generator-react';
import { loadExtensions, loadSpecs, specToIR, validateExtensions, validateSpecs } from '@faravahar/girih-spec';
import type { ComponentIR, LoadedExtension } from '@faravahar/girih-spec';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildPackage } from './build.js';
import { readLock, writeLock } from './lock.js';
import { detectDrift, planManifestUpdate, readManifest, writeManifest } from './manifest.js';
import { printDiagnostics, printSummaryLine, table } from './output.js';
import { runDoctor, workspaceGirihDependencies } from './doctor.js';
import { fetchLatestVersions, updateChecksDisabled } from './registry.js';
import { installedVersion, resolvesFrom } from './resolve.js';
import { scaffoldWorkspace, workspacePackageJson } from './scaffold.js';
import { applyBump, computeSignature, diffSignatures } from './semver.js';

// Read at runtime rather than with an import attribute: the bundler inlines a JSON
// import wholesale, which would ship this package's devDependency list inside dist/.
const { name: PACKAGE_SELF, version } = createRequire(import.meta.url)('../package.json') as {
  name: string;
  version: string;
};

/** Published alongside the CLI at the same version — the workspace is lockstep. */
const RUNTIME_PACKAGE = '@faravahar/girih-react-runtime';

const program = new Command();
program
  .name('girih')
  .description('Compile a multi-brand design system from tokens and component contracts.')
  .version(version, '-v, --version');

const BRAND_NAME = /^[a-z][a-z0-9-]*$/;
const PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** Can ds.config.ts's `import '@faravahar/girih'` resolve from this directory? */
function hasResolvableCli(cwd: string): boolean {
  return resolvesFrom(cwd, PACKAGE_SELF);
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
async function loadEjectedSources(config: ResolvedConfig, build: TokenBuildResult, irs: ComponentIR[]): Promise<Record<string, string>> {
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
    const currentRender = emittedFile(
      'x',
      renderComponentSource(ir, { classPrefix: config.tokens.prefix, runtimePackage: RUNTIME_PACKAGE }),
    );
    if (currentRender.hash !== entry.baseHash) {
      build.diagnostics.push({
        code: 'GIRIH1014',
        severity: 'warning',
        message: `'${name}' was ejected from a different spec/template than the current one — the fork may not honor the contract anymore.`,
        file: path,
        help: 'Review the fork against the current spec, or re-eject after removing the ds.lock entry (`girih forks` reports this; the 3-way merge is not built yet).',
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
  const publishedVersion = lock?.published?.version ?? '0.0.0-dev';
  const reactResult = generateReact(
    irs,
    { packageName: config.name, prefix: config.tokens.prefix, version: publishedVersion },
    { extensions, ejected },
  );
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
  .command('create <directory>')
  .description('Create a new girih workspace in a new directory, then install and initialise it.')
  .option('--name <package>', 'published package name (default: @<directory>/design-system)')
  .option('--brand <name>', 'default brand name', 'main')
  .option('--no-install', 'scaffold only; print the install command instead of running it')
  .action(async (directory: string, options: { name?: string; brand: string; install: boolean }) => {
    const dir = resolve(process.cwd(), directory);
    const workspaceName = basename(dir);

    if (existsSync(join(dir, 'package.json'))) {
      console.error(pc.red(`${dir} already has a package.json — refusing to scaffold over it.`));
      process.exitCode = 1;
      return;
    }
    if (!BRAND_NAME.test(options.brand)) {
      console.error(pc.red(`Brand name '${options.brand}' must be lowercase kebab-case (it becomes a [data-brand] selector).`));
      process.exitCode = 1;
      return;
    }
    const name = options.name ?? `@${workspaceName}/design-system`;
    if (!PACKAGE_NAME.test(name)) {
      console.error(pc.red(`'${name}' is not a valid npm package name.`));
      if (!options.name) console.error(pc.dim(`(derived from the directory name — pass --name @scope/design-system explicitly)`));
      process.exitCode = 1;
      return;
    }

    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'package.json'),
      workspacePackageJson({ workspaceName, cliPackage: PACKAGE_SELF, runtimePackage: RUNTIME_PACKAGE, version }),
      'utf8',
    );
    console.log(`${pc.green('create')}  ${join(directory, 'package.json')}`);
    const { written } = await scaffoldWorkspace(dir, { name, brand: options.brand });
    for (const path of written) console.log(`${pc.green('create')}  ${join(directory, path)}`);

    const packageManager = detectPackageManager();
    if (!options.install) {
      console.log(`\n${pc.bold(name)} scaffolded. Finish with:`);
      console.log(`  ${pc.cyan(`cd ${directory} && ${packageManager} install`)}`);
      return;
    }

    console.log(`\ninstall (${packageManager})…`);
    const install = spawnSync(packageManager, ['install'], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
    if (install.status !== 0) {
      console.error(pc.red(`\n${packageManager} install failed — run it yourself in ${directory}.`));
      process.exitCode = install.status ?? 1;
      return;
    }

    console.log(`\n${pc.bold(name)} is ready:`);
    console.log(`  ${pc.cyan(`cd ${directory}`)}`);
    console.log(`  ${pc.cyan('girih check')}           validate tokens and contracts`);
    console.log(`  ${pc.cyan('girih generate react')}  compile the design system package`);
    console.log(`  ${pc.cyan('open demo/index.html')}  see every variant, size, and brand`);
  });

program
  .command('init')
  .description('Scaffold a girih workspace in the current directory (for a project that already has a package.json).')
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
      console.log(`  ${pc.cyan('npm install -D @faravahar/girih')}   (ds.config.ts imports it)`);
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
      await writeFile(
        configPath,
        `${source.slice(0, insertAt - match[1]!.length)}${match[1]}${snippet}\n${match[1]}${source.slice(insertAt)}`,
        'utf8',
      );
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
    console.log(
      `${pc.green('build')}  ${join(outputBase, 'dist')} ${pc.dim(`(${js} module${js === 1 ? '' : 's'} + ${dts} declaration${dts === 1 ? '' : 's'})`)}`,
    );
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

/**
 * Which package manager invoked us. The user-agent is set by npm/pnpm/yarn/bun when
 * running through them; a lockfile is the fallback for a global install.
 */
function detectPackageManager(): string {
  const userAgent = process.env['npm_config_user_agent'] ?? '';
  for (const manager of ['pnpm', 'yarn', 'bun'] as const) {
    if (userAgent.startsWith(manager)) return manager;
  }
  if (userAgent.startsWith('npm')) return 'npm';
  for (const [file, manager] of [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
  ] as const) {
    if (existsSync(join(process.cwd(), file))) return manager;
  }
  return 'npm';
}

function bumpPackageVersion(source: string, nextVersion: string): string {
  return source.replace(/("version":\s*")[^"]*(")/, `$1${nextVersion}$2`);
}

function formatValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 48 ? `${text.slice(0, 45)}…` : text;
}

await program.parseAsync(process.argv);
