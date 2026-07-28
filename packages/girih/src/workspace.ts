import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { emittedFile, kebabName, loadConfig } from '@faravahar/girih-core';
import type { EmittedFile, ResolvedConfig } from '@faravahar/girih-core';
import { buildTokenGraphs } from '@faravahar/girih-tokens';
import type { TokenBuildResult } from '@faravahar/girih-tokens';
import { generateReact, renderComponentSource, TEMPLATE_REGISTRY } from '@faravahar/girih-generator-react';
import { loadExtensions, loadSpecs, specToIR, validateExtensions, validateSpecs } from '@faravahar/girih-spec';
import type { ComponentIR, LoadedExtension } from '@faravahar/girih-spec';
import { readLock } from './lock.js';
import { printDiagnostics } from './output.js';
import { resolvesFrom } from './resolve.js';
import { PACKAGE_SELF, RUNTIME_PACKAGE } from './self.js';

/** Can ds.config.ts's `import '@faravahar/girih'` resolve from this directory? */
export function hasResolvableCli(cwd: string): boolean {
  return resolvesFrom(cwd, PACKAGE_SELF);
}
export async function loadWorkspace(): Promise<{ config: ResolvedConfig; build: TokenBuildResult } | null> {
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
export async function loadComponentIRs(
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

/** Ejected sources from ds.lock, read from beside each contract, cross-checked against the catalog. */
export async function loadEjectedSources(
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
        // Both paths are kebab-case. Lowercasing only the first letter named
        // `paymentButton.contract.ts` for a PaymentButton, which never existed.
        help: `Restore design/components/${kebabName(name)}/${kebabName(name)}.contract.ts, or remove the ds.lock entry.`,
      });
      continue;
    }
    const slug = kebabName(name);
    const path = `design/components/${slug}/${slug}.ejected.tsx`;
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

export interface ComposedReact {
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
 * bake so they can never disagree about the output.
 */
export async function composeReact(config: ResolvedConfig, build: TokenBuildResult, cssFiles: EmittedFile[]): Promise<ComposedReact> {
  const { irs, extensions } = await loadComponentIRs(config, build);
  const ejected = await loadEjectedSources(config, build, irs);
  // The package.json version mirrors the last published version (from ds.lock),
  // never a stale hand-set value — so generate/build/bake agree byte-for-byte.
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
    irFiles: irs.map((ir) => emittedFile(`${kebabName(ir.name)}.json`, JSON.stringify(ir, null, 2) + '\n')),
    irs,
    extensions,
    ejected,
  };
}

/** Truncate a resolved token value for the `check` table without wrapping the row. */
export function formatValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 48 ? `${text.slice(0, 45)}…` : text;
}
