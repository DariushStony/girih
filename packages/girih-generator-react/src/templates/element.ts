import { componentClassName, kebabName } from '@faravahar/girih-core';
import type { ComponentIR } from '@faravahar/girih-spec';

const REF_ELEMENT_TYPES: Record<string, string> = {
  a: 'HTMLAnchorElement',
  button: 'HTMLButtonElement',
  div: 'HTMLDivElement',
  input: 'HTMLInputElement',
  label: 'HTMLLabelElement',
  span: 'HTMLSpanElement',
  textarea: 'HTMLTextAreaElement',
};

/** The DOM ref type a host element forwards — shared with renderExtensionComponent so a base component and its extension wrapper never disagree on the same element. */
export function refElementType(element: string): string {
  return REF_ELEMENT_TYPES[element] ?? 'HTMLElement';
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export interface TemplateOptions {
  /** CSS class prefix, e.g. 'ds' → .ds-button */
  classPrefix: string;
  runtimePackage: string;
}

/**
 * Hand-maintained structural defaults per template — the part of the
 * implementation that is not a design decision. Everything design-flavored
 * still flows through token var() references.
 */
const INTERACTIVE_ELEMENTS = new Set(['a', 'button', 'input', 'select', 'textarea']);
const TEXT_ENTRY_ELEMENTS = new Set(['input', 'textarea']);
const INLINE_ELEMENTS = new Set(['span']);

/** Structural CSS the element template owns: box behavior, focus ring, disabled/loading. */
export function elementStructuralCss(ir: ComponentIR, base: string): string[] {
  if (!INTERACTIVE_ELEMENTS.has(ir.element)) {
    // Non-interactive inline hosts (Badge) still need box behavior for padding to work.
    return INLINE_ELEMENTS.has(ir.element)
      ? [
          `${base} {
  display: inline-flex;
  align-items: center;
}`,
        ]
      : [];
  }
  const textEntry = TEXT_ENTRY_ELEMENTS.has(ir.element);
  const blocks = [
    textEntry
      ? `${base} {
  display: inline-flex;
  align-items: center;
  border: 1px solid transparent;
  font: inherit;
  cursor: text;
}`
      : `${base} {
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
 * The "styled element" template: a presentational host element whose entire
 * styling contract flows through data attributes + CSS variables. Behavioral
 * components (Dialog on Base UI) get their own template in M5.
 */
export function renderElementComponent(ir: ComponentIR, options: TemplateOptions): string {
  const { name, element } = ir;
  const refType = refElementType(element);
  const className = componentClassName(options.classPrefix, name);
  const hasLoading = ir.states.includes('loading');
  const hasDisabled = ir.states.includes('disabled');
  const hasInvalid = ir.states.includes('invalid');
  const nativeDisabled = ['button', 'input', 'textarea', 'select'].includes(element);

  const variantTypes = ir.variants
    .map((axis) => `export type ${name}${capitalize(axis.axis)} = ${axis.values.map((v) => `'${v}'`).join(' | ')};`)
    .join('\n');

  // Spec-authored prop names must shadow native attributes (input's size?: number
  // would otherwise clash with a 'size' axis) — omit them from the inherited props.
  const localNames = [...ir.variants.map((a) => a.axis), ...ir.props.map((p) => p.name)];
  const inherited =
    localNames.length > 0
      ? `Omit<ComponentPropsWithoutRef<'${element}'>, ${localNames.map((n) => `'${n}'`).join(' | ')}>`
      : `ComponentPropsWithoutRef<'${element}'>`;

  const propLines: string[] = [
    ...ir.variants.map((axis) => `  ${axis.axis}?: ${name}${capitalize(axis.axis)};`),
    ...ir.props.map((p) => `  ${p.name}?: boolean;`),
  ];
  if (hasLoading) propLines.push('  loading?: boolean;');
  if (hasInvalid) propLines.push('  invalid?: boolean;');
  // Non-native hosts have no built-in disabled — the template owns the prop.
  if (hasDisabled && !nativeDisabled) propLines.push('  disabled?: boolean;');

  const destructured: string[] = [
    ...ir.variants.map((axis) => `${axis.axis} = '${axis.default}'`),
    ...ir.props.map((p) => `${p.name} = ${p.default}`),
  ];
  if (hasLoading) destructured.push('loading = false');
  if (hasInvalid) destructured.push('invalid = false');
  destructured.push('className');
  if (hasDisabled) destructured.push(nativeDisabled ? 'disabled' : 'disabled = false');
  if (element === 'button') destructured.push(`type = 'button'`);
  if (ir.childrenRequired) destructured.push('children');

  const attrs: string[] = [
    `ref={ref}`,
    `className={cx('${className}', className)}`,
    ...ir.variants.map((axis) => `data-${kebabName(axis.axis)}={${axis.axis}}`),
    ...ir.props.map((p) => `data-${kebabName(p.name)}={${p.name} || undefined}`),
  ];
  if (hasLoading) attrs.push(`data-loading={loading || undefined}`);
  if (hasInvalid) {
    attrs.push(`data-invalid={invalid || undefined}`);
    // aria-invalid is the announced state; data-invalid is the styling hook. One
    // prop drives both so they can never disagree.
    attrs.push(`aria-invalid={invalid || undefined}`);
  }
  const wiredAria = new Set<string>();
  for (const aria of ir.accessibility.aria) {
    if (aria.state === 'loading' && hasLoading) {
      for (const [attr, value] of Object.entries(aria.attributes)) {
        attrs.push(`${attr}={loading ? '${value}' : undefined}`);
        wiredAria.add(attr);
      }
    }
    if (aria.state === 'disabled' && hasDisabled && !nativeDisabled) {
      for (const [attr, value] of Object.entries(aria.attributes)) {
        attrs.push(`${attr}={disabled ? '${value}' : undefined}`);
        wiredAria.add(attr);
      }
    }
  }
  if (hasDisabled && nativeDisabled) {
    attrs.push(hasLoading ? `disabled={disabled || loading}` : `disabled={disabled}`);
  }
  if (hasDisabled && !nativeDisabled && !wiredAria.has('aria-disabled')) {
    // Without this the [aria-disabled="true"] state selector could never activate.
    attrs.push(`aria-disabled={disabled ? 'true' : undefined}`);
  }
  if (element === 'button') attrs.push('type={type}');
  if (ir.accessibility.role && ir.accessibility.role !== element) {
    attrs.push(`role="${ir.accessibility.role}"`);
  }

  const attrBlock = attrs.map((a) => `      ${a}`).join('\n');
  const jsx = ir.childrenRequired
    ? `    <${element}\n${attrBlock}\n      {...rest}\n    >\n      {children}\n    </${element}>`
    : `    <${element}\n${attrBlock}\n      {...rest}\n    />`;
  const doc = ir.description ? `/** ${ir.description} */\n` : '';

  return `/* Generated by girih — do not edit. Source of truth: components/${kebabName(name)}.contract.ts */
import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { cx } from '${options.runtimePackage}';

${variantTypes}

export interface ${name}Props extends ${inherited} {
${propLines.join('\n')}
}

${doc}export const ${name} = forwardRef<${refType}, ${name}Props>(function ${name}(
  { ${destructured.join(', ')}, ...rest },
  ref,
) {
  return (
${jsx}
  );
});
`;
}
