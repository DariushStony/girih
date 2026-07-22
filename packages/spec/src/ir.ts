import type { Diagnostic } from '@girih/core';
import type {
  ComponentIR,
  ComponentSpecInput,
  ComponentState,
  StyleRuleIR,
  VariantBlockIR,
} from './types.js';

/** camelCase → kebab-case; a leading capital marks a vendor prefix (WebkitMask → -webkit-mask). */
export function kebabCase(camel: string): string {
  const kebab = camel.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return /^[A-Z]/.test(camel) ? `-${kebab}` : kebab;
}

export interface SpecToIRResult {
  ir: ComponentIR;
  diagnostics: Diagnostic[];
}

/** Normalize an authored spec into the canonical, generator-facing JSON form. */
export function specToIR(spec: ComponentSpecInput): SpecToIRResult {
  const diagnostics: Diagnostic[] = [];

  const toRules = (decls: Record<string, unknown> | undefined, where: string): StyleRuleIR[] => {
    if (!decls) return [];
    const rules: StyleRuleIR[] = [];
    for (const [property, value] of Object.entries(decls)) {
      if (property === 'states') continue;
      if (typeof value === 'string') {
        rules.push({ property: kebabCase(property), ref: value });
      } else if (value !== undefined) {
        const diagnostic: Diagnostic = {
          code: 'GIRIH4014',
          severity: 'error',
          message: `'${spec.name}' has a non-string declaration for '${property}' at ${where} — every styled value must be a '{token.path}' reference.`,
          path: `${where}.${property}`,
        };
        if (typeof value === 'object' && value !== null) {
          diagnostic.help = `Did you mean to nest '${property}' under a 'states' key?`;
        }
        diagnostics.push(diagnostic);
      }
    }
    return rules;
  };

  const variantBlocks: VariantBlockIR[] = [];
  for (const [axis, values] of Object.entries(spec.tokens?.variants ?? {})) {
    for (const [value, block] of Object.entries(values)) {
      const states = Object.entries(block.states ?? {}).map(([state, declarations]) => ({
        state: state as ComponentState,
        declarations: toRules(declarations as Record<string, unknown>, `${axis}.${value}.${state}`),
      }));
      variantBlocks.push({ axis, value, declarations: toRules(block, `${axis}.${value}`), states });
    }
  }

  // Behavioral templates own their host element; specs cannot re-point them.
  const template = spec.template ?? 'element';
  const TEMPLATE_ELEMENTS: Record<string, string> = { checkbox: 'input', dialog: 'div' };

  const ir: ComponentIR = {
    name: spec.name,
    description: spec.description,
    template,
    element: TEMPLATE_ELEMENTS[template] ?? spec.element ?? 'div',
    variants: Object.entries(spec.variants ?? {}).map(([axis, def]) => ({
      axis,
      values: [...def.values],
      default: def.default,
    })),
    states: [...(spec.states ?? [])],
    props: Object.entries(spec.props ?? {}).map(([name, def]) => ({
      name,
      type: def.type,
      default: def.default ?? false,
    })),
    childrenRequired: spec.slots?.children?.required ?? false,
    tokens: {
      base: toRules(spec.tokens?.base, 'base'),
      baseStates: Object.entries(spec.tokens?.states ?? {}).map(([state, declarations]) => ({
        state: state as ComponentState,
        declarations: toRules(declarations as Record<string, unknown>, `states.${state}`),
      })),
      variants: variantBlocks,
      parts: Object.entries(spec.tokens?.parts ?? {}).map(([part, declarations]) => ({
        part,
        declarations: toRules(declarations, `parts.${part}`),
      })),
    },
    accessibility: {
      role: spec.accessibility?.role,
      focusable: spec.accessibility?.focusable ?? true,
      aria: Object.entries(spec.accessibility?.aria ?? {}).map(([state, attributes]) => ({
        state: state as ComponentState,
        attributes: { ...attributes },
      })),
    },
    extensibility: {
      allowExtends: spec.extensibility?.allowExtends ?? false,
      overridableTokens: [...(spec.extensibility?.overridableTokens ?? [])],
    },
  };

  return { ir, diagnostics };
}

/** Every '{token.path}' reference used anywhere in the IR. */
export function irTokenRefs(ir: ComponentIR): Array<{ ref: string; where: string }> {
  const refs: Array<{ ref: string; where: string }> = [];
  const collect = (rules: StyleRuleIR[], where: string) => {
    for (const rule of rules) refs.push({ ref: rule.ref, where: `${where}.${rule.property}` });
  };
  collect(ir.tokens.base, 'base');
  for (const state of ir.tokens.baseStates) collect(state.declarations, `states.${state.state}`);
  for (const block of ir.tokens.variants) {
    collect(block.declarations, `${block.axis}.${block.value}`);
    for (const state of block.states) collect(state.declarations, `${block.axis}.${block.value}.${state.state}`);
  }
  for (const part of ir.tokens.parts) collect(part.declarations, `parts.${part.part}`);
  return refs;
}
