/**
 * The one CSS variable naming rule, shared by every generator so emitted
 * artifacts (tokens.css, tokens.d.ts, components.css) can never disagree.
 * Token names are expected to be lowercase/kebab already (GIRIH2007 warns
 * upstream); segments are joined with '-'.
 */
export function cssVarName(prefix: string, path: string | string[]): string {
  const segments = Array.isArray(path) ? path : path.split('.');
  return `--${[prefix, ...segments].join('-').toLowerCase()}`;
}

/**
 * The cascade layers girih emits into, in order. Consumer CSS is unlayered and so
 * always wins, whatever its specificity — which is the point: overriding a generated
 * component should never need a specificity fight or `!important`.
 */
export const CSS_LAYERS = { tokens: 'girih.tokens', components: 'girih.components' } as const;

/**
 * Wrap emitted CSS in `layer`, preceded by the order declaration.
 *
 * The order is declared in *both* stylesheets rather than just the first, because a
 * consumer may import them in either order and the earliest `@layer` statement is what
 * establishes precedence. Repeating an identical statement is idempotent, so this is
 * correct either way round — and it means neither file depends on the other loading.
 */
export function cssLayer(layer: (typeof CSS_LAYERS)[keyof typeof CSS_LAYERS], css: string): string {
  const indented = css
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `  ${line}`))
    .join('\n');
  return `@layer ${CSS_LAYERS.tokens}, ${CSS_LAYERS.components};\n\n@layer ${layer} {\n${indented}\n}`;
}
