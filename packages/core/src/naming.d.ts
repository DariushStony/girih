/**
 * The one CSS variable naming rule, shared by every generator so emitted
 * artifacts (tokens.css, tokens.d.ts, components.css) can never disagree.
 * Token names are expected to be lowercase/kebab already (GIRIH2007 warns
 * upstream); segments are joined with '-'.
 */
export declare function cssVarName(prefix: string, path: string | string[]): string;
//# sourceMappingURL=naming.d.ts.map
