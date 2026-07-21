/**
 * The one CSS variable naming rule, shared by the CSS emitter and the TokenPath
 * type generator so the two artifacts can never disagree.
 * Token names are expected to be lowercase/kebab already (enforced upstream by
 * DTCG name rules); segments are joined with '-'.
 */
export function cssVarName(prefix: string, path: string | string[]): string {
  const segments = Array.isArray(path) ? path : path.split('.');
  return `--${[prefix, ...segments].join('-').toLowerCase()}`;
}
