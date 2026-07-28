import { componentClassName, cssVarName, extensionClassName, kebabName } from '@faravahar/girih-core';
import type { ComponentIR, ComponentState, StyleRuleIR, VariantExtensionInput } from '@faravahar/girih-spec';
import { TEMPLATE_REGISTRY } from './templates/registry.js';

/** How each declarable state attaches to the base selector. */
const STATE_SELECTORS: Record<ComponentState, string[]> = {
  hover: [':hover:not(:disabled):not([aria-disabled="true"])'],
  active: [':active:not(:disabled):not([aria-disabled="true"])'],
  'focus-visible': [':focus-visible'],
  disabled: [':disabled', '[aria-disabled="true"]'],
  loading: ['[data-loading="true"]'],
  checked: [':checked'],
  // Targets the announced attribute rather than data-invalid, so a consumer who sets
  // aria-invalid directly on a native input gets the styling too. The template emits
  // both from one prop, so they cannot disagree.
  invalid: ['[aria-invalid="true"]'],
};

function declarations(rules: StyleRuleIR[], prefix: string): string {
  return rules.map((rule) => `  ${rule.property}: var(${cssVarName(prefix, rule.ref.slice(1, -1))});`).join('\n');
}

/**
 * Component styles are structure plus token plumbing: every design value is a
 * var() reference into the token layer, so brand switching never touches this file.
 */
export function renderComponentCss(ir: ComponentIR, options: { prefix: string; classPrefix: string }): string {
  const base = `.${componentClassName(options.classPrefix, ir.name)}`;
  const blocks: string[] = [];

  const structuralCss = TEMPLATE_REGISTRY[ir.template]?.structuralCss;
  if (structuralCss) blocks.push(...structuralCss(ir, base, options.prefix));

  // Dialog styling attaches to parts; its base/variant blocks target the popup.
  const styledBase = ir.template === 'dialog' ? `${base}-popup` : base;

  for (const part of ir.tokens.parts) {
    if (part.declarations.length === 0) continue;
    blocks.push(`${base}-${part.part} {\n${declarations(part.declarations, options.prefix)}\n}`);
  }

  if (ir.tokens.base.length > 0) {
    blocks.push(`${styledBase} {\n${declarations(ir.tokens.base, options.prefix)}\n}`);
  }

  for (const state of ir.tokens.baseStates) {
    if (state.declarations.length === 0) continue;
    const suffixes = STATE_SELECTORS[state.state] ?? [];
    if (suffixes.length === 0) continue;
    const selectors = suffixes.map((suffix) => `${styledBase}${suffix}`).join(',\n');
    blocks.push(`${selectors} {\n${declarations(state.declarations, options.prefix)}\n}`);
  }

  for (const block of ir.tokens.variants) {
    const variantSelector = `${styledBase}[data-${kebabName(block.axis)}="${block.value}"]`;
    if (block.declarations.length > 0) {
      blocks.push(`${variantSelector} {\n${declarations(block.declarations, options.prefix)}\n}`);
    }
    for (const state of block.states) {
      if (state.declarations.length === 0) continue;
      const suffixes = STATE_SELECTORS[state.state] ?? [];
      if (suffixes.length === 0) continue; // unknown states are validation's job (GIRIH4011), never a crash
      const selectors = suffixes.map((suffix) => `${variantSelector}${suffix}`).join(',\n');
      blocks.push(`${selectors} {\n${declarations(state.declarations, options.prefix)}\n}`);
    }
  }

  return blocks.join('\n\n');
}

/**
 * Extension CSS rides on the base component's class plus a doubled extension
 * class, and re-asserts its values across the base component's interactive
 * states — variant-state selectors carry higher specificity than a flat class
 * pair, so source order alone would let hover styles revert the extension.
 * Extension values are state-invariant by design (the 10% is a restyle, not a
 * new state machine).
 */
export function renderExtensionCss(
  extension: VariantExtensionInput,
  baseIr: ComponentIR,
  options: { prefix: string; classPrefix: string },
): string {
  const baseClass = `.${componentClassName(options.classPrefix, baseIr.name)}`;
  const extensionClass = `.${extensionClassName(options.classPrefix, extension.name)}`;
  const host = baseIr.template === 'dialog' ? `${baseClass}-popup` : baseClass;
  const styled = `${host}${extensionClass}${extensionClass}`;

  const selectors = [styled];
  for (const state of baseIr.states) {
    if (state !== 'hover' && state !== 'active') continue; // visual-feedback states that variants restyle
    for (const suffix of STATE_SELECTORS[state] ?? []) selectors.push(`${styled}${suffix}`);
  }

  const rules = Object.entries(extension.tokens).map(([property, ref]) => ({ property: kebabName(property), ref }));
  return `${selectors.join(',\n')} {\n${declarations(rules, options.prefix)}\n}`;
}
