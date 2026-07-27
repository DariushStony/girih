import type { Diagnostic } from '@faravahar/girih-core';
import type { ResolvedTokenGraph, TokenTier } from './types.js';

const TIER_RANK: Record<TokenTier, number> = { global: 0, semantic: 1, component: 2 };

/**
 * Tier discipline: references may only point sideways or downward
 * (component → semantic → global). A component token referencing global
 * directly skips the semantic tier — legal but worth a warning.
 */
export function validateTierDirection(graph: ResolvedTokenGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const token of graph.tokens.values()) {
    for (const ref of token.references) {
      const target = graph.tokens.get(ref);
      if (!target) continue; // unknown refs already reported by the resolver
      if (TIER_RANK[target.tier] > TIER_RANK[token.tier]) {
        diagnostics.push({
          code: 'GIRIH2040',
          severity: 'error',
          message: `${token.tier} token '${token.path}' references ${target.tier} token '{${ref}}' — references must flow component → semantic → global, never upward.`,
          file: token.file,
          path: token.path,
        });
      } else if (token.tier === 'component' && target.tier === 'global') {
        diagnostics.push({
          code: 'GIRIH2041',
          severity: 'warning',
          message: `component token '${token.path}' references global token '{${ref}}' directly, skipping the semantic tier.`,
          file: token.file,
          path: token.path,
          help: `Introduce a semantic alias for '{${ref}}' so brands can re-theme it without touching component tokens.`,
        });
      }

      // Whole-value alias must not change the declared $type.
      if (token.value === `{${ref}}` && token.type !== undefined && target.type !== undefined && token.type !== target.type) {
        diagnostics.push({
          code: 'GIRIH2042',
          severity: 'error',
          message: `'${token.path}' ($type '${token.type}') aliases '{${ref}}' which has $type '${target.type}'.`,
          file: token.file,
          path: token.path,
        });
      }
    }
  }
  return diagnostics;
}

/**
 * Every brand must resolve the identical token path set. True by construction under
 * the override-only rule — kept as a cheap invariant so future sanctioned exceptions
 * (brand-scoped namespaces) can't silently break consumers.
 */
export function validateBrandParity(graphs: Map<string, ResolvedTokenGraph>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const brands = [...graphs.keys()];
  if (brands.length < 2) return diagnostics;

  const reference = graphs.get(brands[0]!)!;
  const referencePaths = new Set(reference.tokens.keys());
  for (const brand of brands.slice(1)) {
    const paths = new Set(graphs.get(brand)!.tokens.keys());
    const missing = [...referencePaths].filter((p) => !paths.has(p));
    const extra = [...paths].filter((p) => !referencePaths.has(p));
    if (missing.length > 0 || extra.length > 0) {
      diagnostics.push({
        code: 'GIRIH2050',
        severity: 'error',
        message:
          `Brand '${brand}' does not resolve the same token set as '${brands[0]}': ` +
          [
            missing.length > 0 ? `missing ${missing.slice(0, 5).join(', ')}` : '',
            extra.length > 0 ? `extra ${extra.slice(0, 5).join(', ')}` : '',
          ]
            .filter(Boolean)
            .join('; ') +
          '.',
      });
    }
  }
  return diagnostics;
}
