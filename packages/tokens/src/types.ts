export type TokenTier = 'global' | 'semantic' | 'component';

/** One DTCG token file, already read from disk and JSON-parsed. */
export interface TokenFileInput {
  /** Workspace-relative path, used in diagnostics. */
  file: string;
  tier: TokenTier;
  contents: unknown;
}

export interface RawToken {
  /** Dot path, e.g. 'color.blue.500'. */
  path: string;
  /** Raw $value — may contain {alias} references, may be a composite object. */
  value: unknown;
  /** $type, own or inherited from an ancestor group. */
  type: string | undefined;
  tier: TokenTier;
  /** Workspace-relative source file. */
  file: string;
  description?: string;
}

export interface RawTokenSet {
  /** Insertion-ordered, keyed by dot path. */
  tokens: Map<string, RawToken>;
}

export interface ResolvedToken extends RawToken {
  /** Value with every {alias} substituted. undefined when resolution failed (cycle / unknown ref). */
  resolvedValue: unknown;
  /** Direct references found in the raw value. */
  references: string[];
}

export interface ResolvedTokenGraph {
  brand: string;
  tokens: Map<string, ResolvedToken>;
}
