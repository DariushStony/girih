import StyleDictionary from 'style-dictionary';
import type { DesignTokens } from 'style-dictionary/types';
import type { Diagnostic, EmittedFile } from '@faravahar/girih-core';
import { CSS_LAYERS, cssLayer, emittedFile } from '@faravahar/girih-core';
import { toNestedDtcg } from '@faravahar/girih-tokens';
import type { ResolvedTokenGraph, TokenBuildResult } from '@faravahar/girih-tokens';
import { cssVarName } from './naming.js';

export interface GenerateCssOptions {
  prefix: string;
  defaultBrand: string;
  selector: 'data-attribute' | 'class';
}

export interface GenerateCssResult {
  files: EmittedFile[];
  diagnostics: Diagnostic[];
}

/** Composite $values (shadow, typography, …) must be flattened to CSS strings, not stringified objects. */
const CSS_TRANSFORMS = [
  'name/girih',
  'color/css',
  'fontFamily/css',
  'cubicBezier/css',
  'shadow/css/shorthand',
  'typography/css/shorthand',
  'border/css/shorthand',
  'transition/css/shorthand',
  'strokeStyle/css/shorthand',
];

function brandSelector(brand: string, kind: GenerateCssOptions['selector']): string {
  return kind === 'class' ? `.brand-${brand}` : `[data-brand="${brand}"]`;
}

/** Deterministic regardless of the host locale — plain code-unit comparison. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Emit one stylesheet: a :root block for the default brand (with var() references
 * preserved, so brand overrides cascade), plus one scoped block per non-default
 * brand. A brand block re-emits the union of that brand's overrides and the default
 * brand's overrides — the latter so a default-brand override never leaks into other
 * brands through :root.
 */
export async function generateCss(build: TokenBuildResult, options: GenerateCssOptions): Promise<GenerateCssResult> {
  const diagnostics: Diagnostic[] = [];
  const blocks: string[] = [];

  diagnostics.push(...detectVarNameCollisions(build, options));
  if (diagnostics.some((d) => d.severity === 'error')) {
    return { files: [], diagnostics };
  }

  const defaultOverrides = build.overrides.get(options.defaultBrand) ?? [];
  const brands = [...build.graphs.keys()].sort((a, b) =>
    a === options.defaultBrand ? -1 : b === options.defaultBrand ? 1 : byCodeUnit(a, b),
  );

  const allOverrides = [...build.overrides.values()].flat();

  for (const brand of brands) {
    const isDefault = brand === options.defaultBrand;
    // A brand block must re-declare not just the overridden tokens but every token
    // that transitively references them: custom properties are computed where they
    // are declared, so a var() chain declared only in :root resolves against :root's
    // values and would ignore a nested [data-brand] scope entirely.
    // The default brand gets a block too (in addition to :root) covering every
    // token ANY brand overrides — otherwise nesting a provider back to the default
    // inside another brand's scope would silently keep the outer brand's values.
    const roots = isDefault ? allOverrides : [...(build.overrides.get(brand) ?? []), ...defaultOverrides];
    const blockPaths = dependentsClosure(roots, build.graphs.get(brand)!);
    const emitScopedBlock = blockPaths.size > 0;

    const graph = build.graphs.get(brand)!;
    const scopedSelector = brandSelector(brand, options.selector);

    // The default brand emits :root (all tokens) plus its scoped block; other
    // brands emit only their scoped block.
    const blockSpecs: Array<{ selector: string; filtered: boolean }> = isDefault
      ? [{ selector: ':root', filtered: false }, ...(emitScopedBlock ? [{ selector: scopedSelector, filtered: true }] : [])]
      : emitScopedBlock
        ? [{ selector: scopedSelector, filtered: true }]
        : [];

    for (const blockSpec of blockSpecs) {
      try {
        const sd = new StyleDictionary({
          tokens: toNestedDtcg({ tokens: graph.tokens }) as DesignTokens,
          log: { verbosity: 'silent', warnings: 'disabled' },
          hooks: {
            transforms: {
              'name/girih': {
                type: 'name',
                transform: (token, platform) => cssVarName(platform?.prefix ?? options.prefix, token.path).slice(2),
              },
            },
          },
          platforms: {
            css: {
              transforms: CSS_TRANSFORMS,
              prefix: options.prefix,
              files: [
                {
                  destination: 'tokens.css',
                  format: 'css/variables',
                  options: { selector: blockSpec.selector, outputReferences: true },
                  ...(blockSpec.filtered ? { filter: (token) => blockPaths.has(token.path.join('.')) } : {}),
                },
              ],
            },
          },
        });
        const formatted = await sd.formatPlatform('css');
        const output = formatted[0]?.output;
        if (typeof output === 'string') {
          diagnostics.push(...detectUnserializableValues(output, brand));
          blocks.push(output.trimEnd());
        }
      } catch (error) {
        diagnostics.push({
          code: 'GIRIH3001',
          severity: 'error',
          message: `CSS generation failed for brand '${brand}': ${(error as Error).message}`,
        });
      }
    }
  }

  const banner = `/* Generated by girih — do not edit. Source of truth: tokens/ and brands/. */\n\n`;
  const files = [
    emittedFile('tokens.css', banner + cssLayer(CSS_LAYERS.tokens, blocks.join('\n\n')) + '\n'),
    generateTokenTypes(build, options),
  ];
  return { files, diagnostics };
}

/** TokenPath string-literal union — this is what makes token references type-checked in specs. */
export function generateTokenTypes(build: TokenBuildResult, options: GenerateCssOptions): EmittedFile {
  const graph = build.graphs.get(options.defaultBrand) ?? [...build.graphs.values()][0];
  const paths = graph ? [...graph.tokens.keys()].sort(byCodeUnit) : [];
  const union = (literals: string[]): string[] =>
    literals.length === 0 ? ['  never;'] : literals.map((l, i) => `  | '${l}'${i === literals.length - 1 ? ';' : ''}`);
  const lines = [
    '/* Generated by girih — do not edit. */',
    '',
    'export type TokenPath =',
    ...union(paths),
    '',
    'export type TokenCssVariable =',
    ...union(paths.map((p) => cssVarName(options.prefix, p))),
    '',
  ];
  return emittedFile('tokens.d.ts', lines.join('\n'));
}

/**
 * Two distinct token paths may map to the same CSS variable name
 * (e.g. 'color.primary.hover' vs 'color.primary-hover', or case-only differences).
 * That is a silent last-one-wins in CSS, so it fails the build.
 */
function detectVarNameCollisions(build: TokenBuildResult, options: GenerateCssOptions): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const graph = build.graphs.get(options.defaultBrand) ?? [...build.graphs.values()][0];
  if (!graph) return diagnostics;

  const byVarName = new Map<string, string[]>();
  for (const path of graph.tokens.keys()) {
    const varName = cssVarName(options.prefix, path);
    if (!byVarName.has(varName)) byVarName.set(varName, []);
    byVarName.get(varName)!.push(path);
  }
  for (const [varName, paths] of byVarName) {
    if (paths.length > 1) {
      diagnostics.push({
        code: 'GIRIH3003',
        severity: 'error',
        message: `Tokens ${paths.map((p) => `'${p}'`).join(' and ')} both map to the CSS variable '${varName}'.`,
        path: paths[0]!,
        help: 'Rename one of them — CSS variable names are case-insensitive here and join segments with "-".',
      });
    }
  }
  return diagnostics;
}

/** The given paths plus every token that (transitively) references one of them. */
function dependentsClosure(roots: string[], graph: ResolvedTokenGraph): Set<string> {
  const closure = new Set(roots);
  if (closure.size === 0) return closure;

  const dependents = new Map<string, string[]>();
  for (const token of graph.tokens.values()) {
    for (const ref of token.references) {
      if (!dependents.has(ref)) dependents.set(ref, []);
      dependents.get(ref)!.push(token.path);
    }
  }

  const queue = [...closure];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const dependent of dependents.get(current) ?? []) {
      if (!closure.has(dependent)) {
        closure.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return closure;
}

/** A value the transform chain could not flatten stringifies as '[object Object]' — fail loudly. */
function detectUnserializableValues(cssBlock: string, brand: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const line of cssBlock.split('\n')) {
    if (line.includes('[object Object]') || line.includes('[object Array]')) {
      const variable = line.trim().split(':')[0] ?? line.trim();
      diagnostics.push({
        code: 'GIRIH3002',
        severity: 'error',
        message: `'${variable}' (brand '${brand}') has a composite value no CSS transform could flatten.`,
        help: 'Give the token a supported $type (shadow, typography, border, transition, cubicBezier, fontFamily) or split it into scalar tokens.',
      });
    }
  }
  return diagnostics;
}
