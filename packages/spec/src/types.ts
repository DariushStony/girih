/** A '{token.path}' reference — validated against every brand's resolved graph at build time. */
export type TokenRef = string;

/** States the M3 template set knows how to implement. The spec cannot express arbitrary behavior. */
export const SUPPORTED_STATES = ['hover', 'active', 'focus-visible', 'disabled', 'loading'] as const;
export type ComponentState = (typeof SUPPORTED_STATES)[number];

export interface VariantAxisInput {
  values: string[];
  default: string;
}

/** CSS declarations for one variant value, with optional per-state overrides. */
export interface VariantTokenBlockInput {
  [cssProperty: string]: TokenRef | Partial<Record<ComponentState, Record<string, TokenRef>>> | undefined;
  states?: Partial<Record<ComponentState, Record<string, TokenRef>>>;
}

export interface ComponentSpecInput {
  /** PascalCase component name, e.g. 'Button'. */
  name: string;
  description?: string;
  /** Host element the template renders, e.g. 'button'. */
  element: string;
  /** Variant axes, e.g. { variant: {...}, size: {...} } — each becomes a typed prop + data attribute. */
  variants?: Record<string, VariantAxisInput>;
  states?: ComponentState[];
  /** Extra boolean props (each becomes a data attribute the CSS may target). */
  props?: Record<string, { type: 'boolean'; default?: boolean }>;
  slots?: { children?: { required?: boolean } };
  tokens?: {
    /** camelCase CSS property → token reference, applied to the base class. */
    base?: Record<string, TokenRef>;
    /** axis → variant value → declaration block. */
    variants?: Record<string, Record<string, VariantTokenBlockInput>>;
  };
  accessibility: {
    role?: string;
    focusable?: boolean;
    /** state → aria attributes the template must set, e.g. { loading: { 'aria-busy': 'true' } }. */
    aria?: Partial<Record<ComponentState, Record<string, string>>>;
  };
}

/* ── Canonical IR — the language-neutral JSON form all generators consume. ── */

export interface VariantAxisIR {
  axis: string;
  values: string[];
  default: string;
}

export interface StyleRuleIR {
  /** kebab-case CSS property. */
  property: string;
  /** '{token.path}' */
  ref: TokenRef;
}

export interface VariantBlockIR {
  axis: string;
  value: string;
  declarations: StyleRuleIR[];
  states: Array<{ state: ComponentState; declarations: StyleRuleIR[] }>;
}

export interface ComponentIR {
  name: string;
  description: string | undefined;
  element: string;
  /** Workspace-relative spec file, stamped by the loader; used in diagnostics. */
  sourceFile?: string;
  variants: VariantAxisIR[];
  states: ComponentState[];
  props: Array<{ name: string; type: 'boolean'; default: boolean }>;
  childrenRequired: boolean;
  tokens: {
    base: StyleRuleIR[];
    variants: VariantBlockIR[];
  };
  accessibility: {
    role: string | undefined;
    focusable: boolean;
    aria: Array<{ state: ComponentState; attributes: Record<string, string> }>;
  };
}
