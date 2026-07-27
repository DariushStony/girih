import type { Diagnostic } from '@faravahar/girih-core';
import type { ResolvedTokenGraph } from '@faravahar/girih-tokens';
import { irTokenRefs } from './ir.js';
import type { ComponentIR } from './types.js';
import { SUPPORTED_STATES } from './types.js';

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;
const REF_SHAPE = /^\{([^{}]+)\}$/;
const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;
const VARIANT_VALUE = /^[a-z0-9][a-z0-9-]*$/;

/** Prop/axis names the "styled element" template claims for itself or React reserves. */
const RESERVED_PROP_NAMES = new Set(['className', 'children', 'style', 'key', 'ref', 'disabled', 'loading', 'type']);

const KNOWN_ELEMENTS = new Set([
  'a',
  'article',
  'aside',
  'button',
  'div',
  'fieldset',
  'footer',
  'form',
  'header',
  'input',
  'label',
  'legend',
  'li',
  'main',
  'nav',
  'ol',
  'option',
  'p',
  'section',
  'select',
  'span',
  'table',
  'td',
  'textarea',
  'th',
  'ul',
]);

/** Not exhaustive — a tripwire for typos ('colour', 'bg'), not a CSS grammar. */
const KNOWN_CSS_PROPERTIES = new Set([
  'align-items',
  'align-self',
  'background',
  'background-color',
  'border',
  'border-color',
  'border-radius',
  'border-style',
  'border-width',
  'bottom',
  'box-shadow',
  'color',
  'column-gap',
  'cursor',
  'display',
  'fill',
  'flex',
  'flex-direction',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'gap',
  'grid-template-columns',
  'height',
  'inset',
  'justify-content',
  'left',
  'letter-spacing',
  'line-height',
  'margin',
  'margin-block',
  'margin-inline',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'opacity',
  'outline',
  'outline-color',
  'outline-offset',
  'outline-width',
  'overflow',
  'padding',
  'padding-block',
  'padding-inline',
  'position',
  'right',
  'row-gap',
  'stroke',
  'text-align',
  'text-decoration',
  'text-decoration-color',
  'text-transform',
  'top',
  'transform',
  'transition',
  'transition-duration',
  'width',
  'z-index',
]);

/** What a hand-maintained template declares it can implement. */
export interface TemplateCapabilities {
  /** Template implementation version — recorded at eject time for future 3-way merges. */
  version: number;
  states: readonly string[];
  /** Named parts the template styles (dialog: backdrop/popup/…). Empty = single element. */
  parts: readonly string[];
  /** Set when the template owns its host element (checkbox → input). */
  fixedElement?: string;
  /** Variant axes the template wires up; undefined = any axis becomes a prop + data attribute. */
  variantAxes?: readonly string[];
}

/**
 * Cross-validate component IRs against every brand's resolved token graph.
 * This is the contract layer: a spec that references a token no brand resolves,
 * declares an unimplementable state, or would generate uncompilable code must
 * fail the build — never silently emit something broken.
 * When a template registry is given, states and parts are validated against
 * each template's declared capabilities instead of the global state list.
 */
export function validateSpecs(
  irs: ComponentIR[],
  graphs: Map<string, ResolvedTokenGraph>,
  templates?: Record<string, TemplateCapabilities>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Map<string, string>();

  for (const ir of irs) {
    const file = ir.sourceFile ?? `components/${ir.name.charAt(0).toLowerCase()}${ir.name.slice(1)}.spec.ts`;

    if (!PASCAL_CASE.test(ir.name)) {
      diagnostics.push({
        code: 'GIRIH4001',
        severity: 'error',
        message: `Component name '${ir.name}' must be PascalCase (it becomes an exported React identifier).`,
        file,
      });
    }
    if (seen.has(ir.name)) {
      diagnostics.push({
        code: 'GIRIH4005',
        severity: 'error',
        message: `Component '${ir.name}' is defined more than once (${seen.get(ir.name)} and ${file}).`,
        file,
      });
    }
    seen.set(ir.name, file);

    const template = templates?.[ir.template];
    if (templates && !template) {
      diagnostics.push({
        code: 'GIRIH4040',
        severity: 'error',
        message: `'${ir.name}' uses template '${ir.template}', which this girih version does not ship.`,
        file,
        help: `Available templates: ${Object.keys(templates).join(', ')}.`,
      });
      continue;
    }

    if (!template?.fixedElement && !KNOWN_ELEMENTS.has(ir.element)) {
      diagnostics.push({
        code: 'GIRIH4018',
        severity: 'warning',
        message: `'${ir.name}' renders '<${ir.element}>', which is not a known host element.`,
        file,
        help: `Known elements: ${[...KNOWN_ELEMENTS].join(', ')}.`,
      });
    }

    const declaredParts = new Set(template?.parts ?? []);
    for (const part of ir.tokens.parts) {
      if (!declaredParts.has(part.part)) {
        diagnostics.push({
          code: 'GIRIH4041',
          severity: 'error',
          message: `'${ir.name}' styles part '${part.part}', which the '${ir.template}' template does not have.`,
          file,
          path: `parts.${part.part}`,
          help:
            declaredParts.size > 0
              ? `Parts of '${ir.template}': ${[...declaredParts].join(', ')}.`
              : `The '${ir.template}' template has no parts — use tokens.base.`,
        });
      }
    }

    // Axis and prop names become props, destructured identifiers, and data attributes:
    // they must be valid identifiers, must not shadow template-reserved names, and
    // must be unique across axes + props — otherwise the generated TSX cannot compile.
    const claimed = new Map<string, string>();
    const claimName = (name: string, what: string) => {
      if (!IDENTIFIER.test(name)) {
        diagnostics.push({
          code: 'GIRIH4013',
          severity: 'error',
          message: `'${ir.name}' ${what} '${name}' is not a valid camelCase identifier — it becomes a React prop.`,
          file,
          path: name,
        });
      } else if (RESERVED_PROP_NAMES.has(name)) {
        diagnostics.push({
          code: 'GIRIH4013',
          severity: 'error',
          message: `'${ir.name}' ${what} '${name}' collides with a name the generated component reserves (${[...RESERVED_PROP_NAMES].join(', ')}).`,
          file,
          path: name,
        });
      } else if (claimed.has(name)) {
        diagnostics.push({
          code: 'GIRIH4013',
          severity: 'error',
          message: `'${ir.name}' declares '${name}' as both ${claimed.get(name)} and ${what} — prop names must be unique.`,
          file,
          path: name,
        });
      }
      claimed.set(name, what);
    };
    for (const axis of ir.variants) claimName(axis.axis, 'a variant axis');
    for (const prop of ir.props) claimName(prop.name, 'a prop');

    if (template?.variantAxes) {
      for (const axis of ir.variants) {
        if (!template.variantAxes.includes(axis.axis)) {
          diagnostics.push({
            code: 'GIRIH4042',
            severity: 'error',
            message: `'${ir.name}' declares variant axis '${axis.axis}', but the '${ir.template}' template only wires up: ${template.variantAxes.join(', ')}.`,
            file,
            path: axis.axis,
            help: 'A silently-ignored axis would validate and then do nothing — declare only axes the template implements.',
          });
        }
      }
    }

    for (const axis of ir.variants) {
      if (axis.values.length === 0) {
        diagnostics.push({
          code: 'GIRIH4006',
          severity: 'error',
          message: `Variant axis '${axis.axis}' of '${ir.name}' has no values.`,
          file,
          path: axis.axis,
        });
        continue;
      }
      for (const value of axis.values) {
        if (!VARIANT_VALUE.test(value)) {
          diagnostics.push({
            code: 'GIRIH4013',
            severity: 'error',
            message: `Variant value '${axis.axis}.${value}' of '${ir.name}' must be lowercase kebab-case (it becomes a data attribute and a CSS selector).`,
            file,
            path: `${axis.axis}.${value}`,
          });
        }
      }
      if (!axis.values.includes(axis.default)) {
        diagnostics.push({
          code: 'GIRIH4007',
          severity: 'error',
          message: `Variant axis '${axis.axis}' of '${ir.name}' defaults to '${axis.default}', which is not one of [${axis.values.join(', ')}].`,
          file,
          path: axis.axis,
        });
      }
    }

    const implementableStates: readonly string[] = template?.states ?? SUPPORTED_STATES;
    for (const state of ir.states) {
      if (!implementableStates.includes(state)) {
        diagnostics.push({
          code: 'GIRIH4008',
          severity: 'error',
          message: `'${ir.name}' declares state '${state}', which the '${ir.template}' template does not implement.`,
          file,
          help: `States of '${ir.template}': ${implementableStates.join(', ') || '(none)'}. States are template capability flags, not arbitrary behavior.`,
        });
      }
    }

    for (const aria of ir.accessibility.aria) {
      if (!ir.states.includes(aria.state)) {
        diagnostics.push({
          code: 'GIRIH4016',
          severity: 'error',
          message: `'${ir.name}' maps aria attributes to state '${aria.state}', which it does not declare under states.`,
          file,
          path: `accessibility.aria.${aria.state}`,
        });
      }
    }

    for (const state of ir.tokens.baseStates) {
      if (!ir.states.includes(state.state)) {
        diagnostics.push({
          code: 'GIRIH4011',
          severity: 'error',
          message: `'${ir.name}' styles state '${state.state}' under tokens.states, but does not declare that state.`,
          file,
          path: `states.${state.state}`,
        });
      }
    }

    for (const block of ir.tokens.variants) {
      const axis = ir.variants.find((v) => v.axis === block.axis);
      if (!axis) {
        diagnostics.push({
          code: 'GIRIH4009',
          severity: 'error',
          message: `'${ir.name}' styles variant axis '${block.axis}', which is not declared under variants.`,
          file,
          path: block.axis,
        });
        continue;
      }
      if (!axis.values.includes(block.value)) {
        diagnostics.push({
          code: 'GIRIH4010',
          severity: 'error',
          message: `'${ir.name}' styles '${block.axis}.${block.value}', but '${block.value}' is not a declared value of that axis.`,
          file,
          path: `${block.axis}.${block.value}`,
        });
      }
      for (const state of block.states) {
        if (!ir.states.includes(state.state)) {
          diagnostics.push({
            code: 'GIRIH4011',
            severity: 'error',
            message: `'${ir.name}' styles state '${state.state}' under '${block.axis}.${block.value}', but does not declare that state.`,
            file,
            path: `${block.axis}.${block.value}.${state.state}`,
          });
        }
      }
    }

    // Token references must exist in EVERY brand and should stay off the global tier.
    for (const { ref, where } of irTokenRefs(ir)) {
      const property = where.split('.').at(-1)!;
      if (!KNOWN_CSS_PROPERTIES.has(property) && !property.startsWith('-')) {
        diagnostics.push({
          code: 'GIRIH4015',
          severity: 'warning',
          message: `'${ir.name}' styles unknown CSS property '${property}' at ${where} — it will be emitted verbatim.`,
          file,
          path: where,
        });
      }

      const match = REF_SHAPE.exec(ref);
      if (!match) {
        diagnostics.push({
          code: 'GIRIH4012',
          severity: 'error',
          message: `'${ir.name}' has a malformed token reference '${ref}' at ${where} — expected '{token.path}'.`,
          file,
          path: where,
        });
        continue;
      }
      const path = match[1]!;
      const missingBrands = [...graphs.keys()].filter((brand) => !graphs.get(brand)!.tokens.get(path));
      if (missingBrands.length > 0) {
        diagnostics.push({
          code: 'GIRIH4002',
          severity: 'error',
          message: `'${ir.name}' references '{${path}}' at ${where}, which ${
            missingBrands.length === graphs.size ? 'no brand resolves' : `brand(s) ${missingBrands.join(', ')} do not resolve`
          }.`,
          file,
          path,
        });
        continue;
      }
      const anyGraph = [...graphs.values()][0];
      if (anyGraph?.tokens.get(path)?.tier === 'global') {
        diagnostics.push({
          code: 'GIRIH4003',
          severity: 'warning',
          message: `'${ir.name}' references global token '{${path}}' at ${where} — specs should consume semantic or component tokens.`,
          file,
          path,
        });
      }
    }
  }

  return diagnostics;
}
