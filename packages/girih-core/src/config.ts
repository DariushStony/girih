import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { createJiti } from 'jiti';
import type { Diagnostic } from './diagnostics.js';
import { addDevCommand, detectPackageManager } from './package-manager.js';

/** User-authored workspace configuration (ds.config.ts). */
export interface GirihConfig {
  /** Published package name, e.g. '@acme/design-system'. */
  name: string;

  tokens?: {
    /** Globs relative to the workspace root. Default: ['design/**\/*.tokens.json'] */
    source?: string[];
    /** CSS variable prefix. Default 'ds' → --ds-color-primary. */
    prefix?: string;
  };

  brands: {
    /** Brand emitted into :root. */
    default: string;
    definitions: Record<
      string,
      {
        /** Path to the brand's overlay token file, relative to the workspace root. */
        tokens: string;
        label?: string;
      }
    >;
  };

  components?: {
    /** Glob for component contracts. Default 'design/components/**\/*.contract.ts'. */
    specs?: string;
    /** Components the generator must skip because they were ejected. */
    ejected?: string[];
    /** Glob for defineVariant extension declarations. Default 'design/components/**\/*.ext.ts'. */
    extensions?: string;
  };

  targets?: {
    react?: { output?: string };
    css?: {
      output?: string;
      /** [data-brand=x] blocks vs .brand-x classes. Default 'data-attribute'. */
      selector?: 'data-attribute' | 'class';
    };
  };

  publish?: { registry?: string; access?: 'public' | 'restricted' };
}

/** Typed identity helper for ds.config.ts authors. */
export function defineConfig(config: GirihConfig): GirihConfig {
  return config;
}

export interface ResolvedBrand {
  name: string;
  label: string;
  /** Absolute path to the overlay token file. */
  tokensFile: string;
}

export interface ResolvedConfig {
  /** Absolute workspace root (directory containing ds.config.ts). */
  root: string;
  name: string;
  tokens: { source: string[]; prefix: string };
  brands: { default: string; all: ResolvedBrand[] };
  components: { specs: string; ejected: string[]; extensions: string };
  targets: {
    react: { output: string };
    css: { output: string; selector: 'data-attribute' | 'class' };
  };
  publish: { registry?: string; access: 'public' | 'restricted' };
}

export const CONFIG_FILENAMES = ['ds.config.ts', 'ds.config.js', 'ds.config.mjs'];

export interface LoadConfigResult {
  config: ResolvedConfig | null;
  diagnostics: Diagnostic[];
}

export async function loadConfig(cwd: string): Promise<LoadConfigResult> {
  const diagnostics: Diagnostic[] = [];
  const root = resolve(cwd);

  const configPath = CONFIG_FILENAMES.map((f) => join(root, f)).find((p) => existsSync(p));
  if (!configPath) {
    diagnostics.push({
      code: 'GIRIH1001',
      severity: 'error',
      message: `No ds.config.ts found in ${root}`,
      help: 'Run `girih init` to scaffold a workspace, or cd into an existing one.',
    });
    return { config: null, diagnostics };
  }

  let raw: GirihConfig;
  try {
    // fsCache off deliberately, and measured: it costs ~70ms per invocation
    // (`girih check` goes ~390ms -> ~460ms). Worth it. jiti otherwise caches into a
    // *shared* directory under the system temp dir, keyed by the parent directory
    // name — so two girih processes running at once (turbo across workspaces, or a
    // parallel test suite) can read a half-written entry and fail with a syntax
    // error in a file the user never wrote. A ds.config.ts is a few lines; there is
    // nothing here worth the shared mutable state.
    //
    // A per-workspace directory (fsCache accepts a path) would win the 70ms back with a
    // much smaller collision window, but not a zero one — two commands in the same
    // workspace would still share a file. A few tens of milliseconds is not worth
    // reasoning about that every time this is read.
    const jiti = createJiti(import.meta.url, { fsCache: false });
    const mod = await jiti.import<{ default?: GirihConfig } | GirihConfig>(configPath);
    raw = (mod as { default?: GirihConfig }).default ?? (mod as GirihConfig);
  } catch (error) {
    const message = (error as Error).message;
    const diagnostic: Diagnostic = {
      code: 'GIRIH1002',
      severity: 'error',
      message: `Failed to load ${configPath}: ${message.split('\n')[0]}`,
      file: 'ds.config.ts',
      // A default rather than a bare code, because the wrapped message is only the first
      // line of the original — without this the user sees a truncated error and no route
      // to the rest of it. The missing-install case below is specific enough to override.
      help: 'The error comes from ds.config.ts itself. It is evaluated as real TypeScript, so a syntax error, an unresolved import, or a throw at module scope all land here.',
    };
    if (message.includes('@faravahar/girih')) {
      diagnostic.help = `ds.config.ts imports '@faravahar/girih' — install it first: ${addDevCommand(detectPackageManager(root), ['@faravahar/girih'])}`;
    }
    diagnostics.push(diagnostic);
    return { config: null, diagnostics };
  }

  diagnostics.push(...validateRawConfig(raw));
  if (diagnostics.some((d) => d.severity === 'error')) {
    return { config: null, diagnostics };
  }

  const brands: ResolvedBrand[] = Object.entries(raw.brands.definitions).map(([name, def]) => ({
    name,
    label: def.label ?? name,
    tokensFile: isAbsolute(def.tokens) ? def.tokens : join(root, def.tokens),
  }));

  const config: ResolvedConfig = {
    root,
    name: raw.name,
    tokens: {
      // One glob covers all three tiers: inferTier reads '/components/' anywhere in the
      // path, so design/components/button/button.tokens.json is a component token while
      // design/tokens/global.tokens.json is a global one.
      source: raw.tokens?.source ?? ['design/**/*.tokens.json'],
      prefix: raw.tokens?.prefix ?? 'ds',
    },
    brands: { default: raw.brands.default, all: brands },
    components: {
      specs: raw.components?.specs ?? 'design/components/**/*.contract.ts',
      ejected: raw.components?.ejected ?? [],
      extensions: raw.components?.extensions ?? 'design/components/**/*.ext.ts',
    },
    targets: {
      react: { output: raw.targets?.react?.output ?? 'packages/design-system' },
      css: {
        output: raw.targets?.css?.output ?? 'packages/design-system/styles',
        selector: raw.targets?.css?.selector ?? 'data-attribute',
      },
    },
    publish: {
      access: raw.publish?.access ?? 'restricted',
      ...(raw.publish?.registry !== undefined ? { registry: raw.publish.registry } : {}),
    },
  };

  for (const brand of brands) {
    if (!existsSync(brand.tokensFile)) {
      diagnostics.push({
        code: 'GIRIH1004',
        severity: 'error',
        message: `Brand '${brand.name}' points at a missing token file: ${brand.tokensFile}`,
        file: 'ds.config.ts',
        help: `Create the overlay file (an empty {} is valid) or fix brands.definitions.${brand.name}.tokens.`,
      });
    }
  }

  return { config: diagnostics.some((d) => d.severity === 'error') ? null : config, diagnostics };
}

function validateRawConfig(raw: GirihConfig): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!raw || typeof raw !== 'object') {
    diagnostics.push({
      code: 'GIRIH1007',
      severity: 'error',
      message: 'ds.config.ts must default-export a config object (use defineConfig).',
      file: 'ds.config.ts',
      help: 'Write `export default defineConfig({ … })`. A named export is not read, and neither is a default that is not an object.',
    });
    return diagnostics;
  }
  if (!raw.name || typeof raw.name !== 'string') {
    diagnostics.push({
      code: 'GIRIH1003',
      severity: 'error',
      message: "Config is missing 'name' (the published package name, e.g. '@acme/design-system').",
      file: 'ds.config.ts',
      help: "Add `name: '@scope/design-system'`. It is the name the generated package is published under, so it has to be one you own.",
    });
  }
  const definitions = raw.brands?.definitions ?? {};
  if (Object.keys(definitions).length === 0) {
    diagnostics.push({
      code: 'GIRIH1005',
      severity: 'error',
      message: 'Config must define at least one brand under brands.definitions.',
      file: 'ds.config.ts',
      help: "Add one: `brands: { default: 'base', definitions: { base: { tokens: 'brands/base/tokens.json' } } }`. An empty {} overlay is valid, so the default brand can override nothing.",
    });
  } else if (!raw.brands.default || !definitions[raw.brands.default]) {
    diagnostics.push({
      code: 'GIRIH1006',
      severity: 'error',
      message: `brands.default ('${raw.brands?.default}') is not a key of brands.definitions.`,
      file: 'ds.config.ts',
      help: `Known brands: ${Object.keys(definitions).join(', ')}`,
    });
  }
  return diagnostics;
}
