import type { Diagnostic } from '@faravahar/girih-core';
import type { ResolvedTokenGraph } from '@faravahar/girih-tokens';

export const REF_SHAPE = /^\{([^{}]+)\}$/;

export interface TokenRefContext {
  /** What is making the reference, as it reads in a diagnostic message — e.g. `'Button'` or `Extension 'PrimaryButton'`. */
  subject: string;
  /** Component-tier namespace this reference may reach into without a warning — the referencing component's own, or the base component an extension extends. */
  ownNamespace: string;
  file: string;
  /** Where in the spec/extension this reference was made — the diagnostic's `path` and message location. */
  where: string;
}

/**
 * One token-reference resolution shared by validateSpecs and validateExtensions: ref-shape,
 * cross-brand existence, global-tier warning, and same-component-namespace warning. Kept in
 * one place because a spec and an extension referencing another component's token namespace
 * is the identical mistake and must be caught identically — two independent copies of this
 * already let it through for specs while catching it for extensions.
 */
export function resolveTokenRef(ref: string, graphs: Map<string, ResolvedTokenGraph>, ctx: TokenRefContext): Diagnostic[] {
  const match = REF_SHAPE.exec(ref);
  if (!match) {
    return [
      {
        code: 'GIRIH4012',
        severity: 'error',
        message: `${ctx.subject} has a malformed token reference '${ref}' at ${ctx.where} — expected '{token.path}'.`,
        file: ctx.file,
        path: ctx.where,
        help: 'A reference is one token path in braces: `{color.action}`. No nesting, no fallback value, no spaces.',
      },
    ];
  }

  const path = match[1]!;
  const missingBrands = [...graphs.keys()].filter((brand) => !graphs.get(brand)!.tokens.get(path));
  if (missingBrands.length > 0) {
    return [
      {
        code: 'GIRIH4002',
        severity: 'error',
        message: `${ctx.subject} references '{${path}}' at ${ctx.where}, which ${
          missingBrands.length === graphs.size ? 'no brand resolves' : `brand(s) ${missingBrands.join(', ')} do not resolve`
        }.`,
        file: ctx.file,
        path,
        help: 'Every brand must resolve the same token set, so the token has to exist in the base tokens — a brand overlay may override paths but never introduce them.',
      },
    ];
  }

  const token = [...graphs.values()][0]?.tokens.get(path);
  if (token?.tier === 'global') {
    return [
      {
        code: 'GIRIH4003',
        severity: 'warning',
        message: `${ctx.subject} references global token '{${path}}' at ${ctx.where} — consume semantic or component tokens instead.`,
        file: ctx.file,
        path,
        help: 'Add a semantic token that aliases this global one and reference that instead. A value bound straight to a global cannot be re-themed per brand.',
      },
    ];
  }
  if (token?.tier === 'component' && path.split('.')[0] !== ctx.ownNamespace) {
    return [
      {
        code: 'GIRIH4038',
        severity: 'warning',
        message: `${ctx.subject} reaches into '{${path}}', another component's token namespace, at ${ctx.where}.`,
        file: ctx.file,
        path,
        help: `Use semantic tokens or '${ctx.ownNamespace}.*' tokens so this survives refactors of unrelated components.`,
      },
    ];
  }

  return [];
}
