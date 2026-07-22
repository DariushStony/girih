import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { createJiti } from 'jiti';
import type { Diagnostic } from './diagnostics.js';

/** User-authored workspace configuration (ds.config.ts). */
export interface GirihConfig {
  /** Published package name, e.g. '@acme/design-system'. */
  name: string;

  tokens?: {
    /** Globs relative to the workspace root. Default: ['tokens/**\/*.tokens.json'] */
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
    /** Glob for component specs. Default 'components/*.spec.ts'. */
    specs?: string;
    /** Components the generator must skip because they were ejected. */
    ejected?: string[];
    /** Glob for createVariant extension sources. Default 'extensions/*.tsx'. */
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
    const jiti = createJiti(import.meta.url);
    const mod = await jiti.import<{ default?: GirihConfig } | GirihConfig>(configPath);
    raw = (mod as { default?: GirihConfig }).default ?? (mod as GirihConfig);
  } catch (error) {
    const message = (error as Error).message;
    const diagnostic: Diagnostic = {
      code: 'GIRIH1002',
      severity: 'error',
      message: `Failed to load ${configPath}: ${message.split('\n')[0]}`,
      file: 'ds.config.ts',
    };
    if (message.includes('@girih/cli')) {
      diagnostic.help = "ds.config.ts imports '@girih/cli' — install it first: npm install -D @girih/cli";
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
      source: raw.tokens?.source ?? ['tokens/**/*.tokens.json'],
      prefix: raw.tokens?.prefix ?? 'ds',
    },
    brands: { default: raw.brands.default, all: brands },
    components: {
      specs: raw.components?.specs ?? 'components/*.spec.ts',
      ejected: raw.components?.ejected ?? [],
      extensions: raw.components?.extensions ?? 'extensions/*.tsx',
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
    });
    return diagnostics;
  }
  if (!raw.name || typeof raw.name !== 'string') {
    diagnostics.push({
      code: 'GIRIH1003',
      severity: 'error',
      message: "Config is missing 'name' (the published package name, e.g. '@acme/design-system').",
      file: 'ds.config.ts',
    });
  }
  const definitions = raw.brands?.definitions ?? {};
  if (Object.keys(definitions).length === 0) {
    diagnostics.push({
      code: 'GIRIH1005',
      severity: 'error',
      message: 'Config must define at least one brand under brands.definitions.',
      file: 'ds.config.ts',
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
