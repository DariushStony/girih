import { cssVarName } from '@girih/core';
import type { ComponentIR, ComponentState, StyleRuleIR } from '@girih/spec';

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** How each declarable state attaches to the base selector. */
const STATE_SELECTORS: Record<ComponentState, string[]> = {
  hover: [':hover:not(:disabled):not([aria-disabled="true"])'],
  active: [':active:not(:disabled):not([aria-disabled="true"])'],
  'focus-visible': [':focus-visible'],
  disabled: [':disabled', '[aria-disabled="true"]'],
  loading: ['[data-loading="true"]'],
};

function declarations(rules: StyleRuleIR[], prefix: string): string {
  return rules.map((rule) => `  ${rule.property}: var(${cssVarName(prefix, rule.ref.slice(1, -1))});`).join('\n');
}

/**
 * Hand-maintained structural defaults for interactive host elements — the part
 * of the template that is not a design decision. Everything design-flavored
 * still flows through token var() references.
 */
const INTERACTIVE_ELEMENTS = new Set(['a', 'button', 'input', 'select', 'textarea']);

function structuralCss(ir: ComponentIR, base: string): string[] {
  if (!INTERACTIVE_ELEMENTS.has(ir.element)) return [];
  const blocks = [
    `${base} {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  font: inherit;
  cursor: pointer;
  text-decoration: none;
}`,
  ];
  if (ir.states.includes('focus-visible')) {
    // A design-neutral, token-independent focus ring: declaring the state must
    // mean something even before the spec styles it.
    blocks.push(`${base}:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}`);
  }
  if (ir.states.includes('disabled') || ir.states.includes('loading')) {
    blocks.push(`${base}:disabled,
${base}[aria-disabled="true"],
${base}[data-loading="true"] {
  cursor: not-allowed;
  opacity: 0.55;
}`);
  }
  return blocks;
}

/**
 * Component styles are structure plus token plumbing: every design value is a
 * var() reference into the token layer, so brand switching never touches this file.
 */
export function renderComponentCss(ir: ComponentIR, options: { prefix: string; classPrefix: string }): string {
  const base = `.${options.classPrefix}-${kebab(ir.name)}`;
  const blocks: string[] = [...structuralCss(ir, base)];

  if (ir.tokens.base.length > 0) {
    blocks.push(`${base} {\n${declarations(ir.tokens.base, options.prefix)}\n}`);
  }

  for (const block of ir.tokens.variants) {
    const variantSelector = `${base}[data-${kebab(block.axis)}="${block.value}"]`;
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
