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
    /** Glob for defineVariant extension declarations. Default 'extensions/*.ext.ts'. */
    extensions?: string;
  };
  targets?: {
    react?: {
      output?: string;
    };
    css?: {
      output?: string;
      /** [data-brand=x] blocks vs .brand-x classes. Default 'data-attribute'. */
      selector?: 'data-attribute' | 'class';
    };
  };
  publish?: {
    registry?: string;
    access?: 'public' | 'restricted';
  };
}
/** Typed identity helper for ds.config.ts authors. */
export declare function defineConfig(config: GirihConfig): GirihConfig;
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
  tokens: {
    source: string[];
    prefix: string;
  };
  brands: {
    default: string;
    all: ResolvedBrand[];
  };
  components: {
    specs: string;
    ejected: string[];
    extensions: string;
  };
  targets: {
    react: {
      output: string;
    };
    css: {
      output: string;
      selector: 'data-attribute' | 'class';
    };
  };
  publish: {
    registry?: string;
    access: 'public' | 'restricted';
  };
}
export declare const CONFIG_FILENAMES: string[];
export interface LoadConfigResult {
  config: ResolvedConfig | null;
  diagnostics: Diagnostic[];
}
export declare function loadConfig(cwd: string): Promise<LoadConfigResult>;
//# sourceMappingURL=config.d.ts.map
