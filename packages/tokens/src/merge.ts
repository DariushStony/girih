import type { Diagnostic } from '@girih/core';
import { parseTokenFile } from './parse.js';
import type { RawToken, RawTokenSet, TokenFileInput } from './types.js';

export interface MergeResult {
  set: RawTokenSet;
  diagnostics: Diagnostic[];
}

/**
 * Merge the base (non-brand) token files into one set. Duplicate paths are errors,
 * and so are prefix collisions (a token at 'a.b' plus a token at 'a.b.c') — those
 * cannot coexist in the nested DTCG form and would silently shadow each other.
 */
export function mergeTokenFiles(files: TokenFileInput[]): MergeResult {
  const tokens = new Map<string, RawToken>();
  const groupPrefixes = new Map<string, string>(); // ancestor path → file of a token beneath it
  const diagnostics: Diagnostic[] = [];

  for (const file of files) {
    const parsed = parseTokenFile(file);
    diagnostics.push(...parsed.diagnostics);
    for (const token of parsed.tokens) {
      const existing = tokens.get(token.path);
      if (existing) {
        diagnostics.push({
          code: 'GIRIH2010',
          severity: 'error',
          message: `Token '${token.path}' is defined in both ${existing.file} and ${token.file}.`,
          file: token.file,
          path: token.path,
          help: 'Every token path must have exactly one definition; brand overlays are the only sanctioned override.',
        });
        continue;
      }

      const ancestors: string[] = [];
      const segments = token.path.split('.');
      for (let i = 1; i < segments.length; i++) ancestors.push(segments.slice(0, i).join('.'));

      const shadowedAncestor = ancestors.find((a) => tokens.has(a));
      if (shadowedAncestor) {
        diagnostics.push({
          code: 'GIRIH2011',
          severity: 'error',
          message: `Token '${token.path}' is nested under '${shadowedAncestor}', which is itself a token (defined in ${tokens.get(shadowedAncestor)!.file}).`,
          file: token.file,
          path: token.path,
          help: 'A path must be either a token or a group, never both — rename one of them.',
        });
        continue;
      }
      if (groupPrefixes.has(token.path)) {
        diagnostics.push({
          code: 'GIRIH2011',
          severity: 'error',
          message: `Token '${token.path}' is also a group containing other tokens (see ${groupPrefixes.get(token.path)}).`,
          file: token.file,
          path: token.path,
          help: 'A path must be either a token or a group, never both — rename one of them.',
        });
        continue;
      }

      for (const ancestor of ancestors) {
        if (!groupPrefixes.has(ancestor)) groupPrefixes.set(ancestor, token.file);
      }
      tokens.set(token.path, token);
    }
  }

  return { set: { tokens }, diagnostics };
}

export interface OverlayResult extends MergeResult {
  /** Paths the overlay actually overrode — drives per-brand CSS emission. */
  overriddenPaths: string[];
}

/**
 * Apply a brand overlay to the base set. The override-only rule: an overlay may change
 * the value of an existing token, never introduce a new path. This mechanically enforces
 * "one shared component set, brands are skins".
 */
export function applyBrandOverlay(base: RawTokenSet, overlay: TokenFileInput): OverlayResult {
  const tokens = new Map(base.tokens);
  const diagnostics: Diagnostic[] = [];
  const overriddenPaths: string[] = [];

  const parsed = parseTokenFile(overlay);
  diagnostics.push(...parsed.diagnostics);

  for (const token of parsed.tokens) {
    const baseToken = base.tokens.get(token.path);
    if (!baseToken) {
      diagnostics.push({
        code: 'GIRIH2020',
        severity: 'error',
        message: `Brand overlay introduces '${token.path}', which does not exist in the base token set.`,
        file: overlay.file,
        path: token.path,
        help: 'Overlays may only override existing tokens. Define the token in tokens/ first, then override its value here.',
      });
      continue;
    }
    if (token.type !== undefined && baseToken.type !== undefined && token.type !== baseToken.type) {
      diagnostics.push({
        code: 'GIRIH2021',
        severity: 'error',
        message: `Brand overlay changes the $type of '${token.path}' from '${baseToken.type}' to '${token.type}'.`,
        file: overlay.file,
        path: token.path,
        help: 'A brand may change a token value, never its type — types are part of the shared contract.',
      });
      continue;
    }
    tokens.set(token.path, {
      ...baseToken,
      value: token.value,
      file: overlay.file,
    });
    overriddenPaths.push(token.path);
  }

  return { set: { tokens }, diagnostics, overriddenPaths };
}

/** Rebuild the nested DTCG object from a flat set — what style-dictionary consumes. */
export function toNestedDtcg(set: RawTokenSet): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const token of set.tokens.values()) {
    const segments = token.path.split('.');
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      node[segment] ??= {};
      node = node[segment] as Record<string, unknown>;
    }
    const leaf: Record<string, unknown> = { $value: token.value };
    if (token.type !== undefined) leaf.$type = token.type;
    if (token.description !== undefined) leaf.$description = token.description;
    node[segments.at(-1)!] = leaf;
  }
  return root;
}
