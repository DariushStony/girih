import { kebabName } from '@faravahar/girih-core';
import type { Diagnostic } from '@faravahar/girih-core';
import type { ResolvedTokenGraph } from '@faravahar/girih-tokens';
import { irTokenRefs, PASCAL_CASE } from './ir.js';
import { resolveTokenRef } from './token-ref.js';
import type { ComponentIR } from './types.js';
import { SUPPORTED_STATES } from './types.js';

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

/** Component name must be PascalCase and unique across every spec file loaded. */
function checkNameUniqueness(ir: ComponentIR, file: string, seen: Map<string, string>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!PASCAL_CASE.test(ir.name)) {
    diagnostics.push({
      code: 'GIRIH4001',
      severity: 'error',
      message: `Component name '${ir.name}' must be PascalCase (it becomes an exported React identifier).`,
      file,
      help: "The name becomes the exported React identifier, so it has to start with a capital: `name: 'Button'`. The spec file itself stays kebab-case.",
    });
  }
  if (seen.has(ir.name)) {
    diagnostics.push({
      code: 'GIRIH4005',
      severity: 'error',
      message: `Component '${ir.name}' is defined more than once (${seen.get(ir.name)} and ${file}).`,
      file,
      help: 'Two spec files declare the same name, and the name decides the emitted component — so one would overwrite the other. Rename one or delete the duplicate.',
    });
  }
  seen.set(ir.name, file);
  return diagnostics;
}

/** Resolves the template this component uses, when a template registry is given — the rest of validation needs its capabilities. */
function resolveTemplate(
  ir: ComponentIR,
  file: string,
  templates: Record<string, TemplateCapabilities> | undefined,
): { diagnostics: Diagnostic[]; template: TemplateCapabilities | undefined; known: boolean } {
  const template = templates?.[ir.template];
  if (templates && !template) {
    return {
      known: false,
      template,
      diagnostics: [
        {
          code: 'GIRIH4040',
          severity: 'error',
          message: `'${ir.name}' uses template '${ir.template}', which this girih version does not ship.`,
          file,
          help: `Available templates: ${Object.keys(templates).join(', ')}.`,
        },
      ],
    };
  }
  return { known: true, template, diagnostics: [] };
}

/** The host element must be one this template can plausibly render, unless the template owns a fixed one. */
function checkKnownElement(ir: ComponentIR, file: string, template: TemplateCapabilities | undefined): Diagnostic[] {
  if (template?.fixedElement || KNOWN_ELEMENTS.has(ir.element)) return [];
  return [
    {
      code: 'GIRIH4018',
      severity: 'warning',
      message: `'${ir.name}' renders '<${ir.element}>', which is not a known host element.`,
      file,
      help: `Known elements: ${[...KNOWN_ELEMENTS].join(', ')}.`,
    },
  ];
}

/** Every styled part must be one the template actually declares. */
function checkParts(ir: ComponentIR, file: string, template: TemplateCapabilities | undefined): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
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
  return diagnostics;
}

/**
 * Axis and prop names become props, destructured identifiers, and data attributes:
 * they must be valid identifiers, must not shadow template-reserved names, and
 * must be unique across axes + props — otherwise the generated TSX cannot compile.
 */
function checkIdentifiers(ir: ComponentIR, file: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const claimed = new Map<string, string>();
  const claimName = (name: string, what: string) => {
    if (!IDENTIFIER.test(name)) {
      diagnostics.push({
        code: 'GIRIH4013',
        severity: 'error',
        message: `'${ir.name}' ${what} '${name}' is not a valid camelCase identifier — it becomes a React prop.`,
        file,
        path: name,
        help: 'It is destructured by name in the generated component, so it must be a plain camelCase identifier — no dashes, no spaces, not starting with a digit.',
      });
    } else if (RESERVED_PROP_NAMES.has(name)) {
      diagnostics.push({
        code: 'GIRIH4013',
        severity: 'error',
        message: `'${ir.name}' ${what} '${name}' collides with a name the generated component reserves (${[...RESERVED_PROP_NAMES].join(', ')}).`,
        file,
        path: name,
        help: 'The generated component already destructures that name, so reusing it would shadow it. Pick another.',
      });
    } else if (claimed.has(name)) {
      diagnostics.push({
        code: 'GIRIH4013',
        severity: 'error',
        message: `'${ir.name}' declares '${name}' as both ${claimed.get(name)} and ${what} — prop names must be unique.`,
        file,
        path: name,
        help: 'Variant axes and props share one namespace, because both become props on the same component. Rename whichever is less load-bearing.',
      });
    }
    claimed.set(name, what);
  };
  for (const axis of ir.variants) claimName(axis.axis, 'a variant axis');
  for (const prop of ir.props) claimName(prop.name, 'a prop');
  return diagnostics;
}

/** Variant axes must be wired up by the template (when it restricts which ones), have values, and default to one of them. */
function checkVariants(ir: ComponentIR, file: string, template: TemplateCapabilities | undefined): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

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
        help: 'Give the axis at least one value, or remove it — an axis with no values emits a prop that can never be set.',
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
          help: 'Lowercase with dashes: `size-lg`, not `sizeLg` or `Size_LG`. The value is written into a data attribute and matched by a CSS selector.',
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
        help: 'Set default to one of the listed values, or add the missing value to values.',
      });
    }
  }

  return diagnostics;
}

/** Every declared state must be one the template (or, without a registry, the global state list) can implement. */
function checkStates(ir: ComponentIR, file: string, template: TemplateCapabilities | undefined): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
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
  return diagnostics;
}

/** aria attributes map to a state, which must actually be declared — otherwise girih would wire aria for a state that never fires. */
function checkAria(ir: ComponentIR, file: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const aria of ir.accessibility.aria) {
    if (!ir.states.includes(aria.state)) {
      diagnostics.push({
        code: 'GIRIH4016',
        severity: 'error',
        message: `'${ir.name}' maps aria attributes to state '${aria.state}', which it does not declare under states.`,
        file,
        path: `accessibility.aria.${aria.state}`,
        help: 'Add the state to states, or drop the aria mapping. girih only wires aria for states the component declares.',
      });
    }
  }
  return diagnostics;
}

/** A state styled under tokens.states must be declared, or the CSS it emits can never match anything. */
function checkTokenStates(ir: ComponentIR, file: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const state of ir.tokens.baseStates) {
    if (!ir.states.includes(state.state)) {
      diagnostics.push({
        code: 'GIRIH4011',
        severity: 'error',
        message: `'${ir.name}' styles state '${state.state}' under tokens.states, but does not declare that state.`,
        file,
        path: `states.${state.state}`,
        help: 'Declare it under states first. Declaring a state is what makes the template wire it up, so styling alone would emit CSS that nothing ever matches.',
      });
    }
  }
  return diagnostics;
}

/** A variant axis/value styled under tokens.variants must be a declared axis, value, and (per-state) declared state. */
function checkTokenVariants(ir: ComponentIR, file: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const block of ir.tokens.variants) {
    const axis = ir.variants.find((v) => v.axis === block.axis);
    if (!axis) {
      diagnostics.push({
        code: 'GIRIH4009',
        severity: 'error',
        message: `'${ir.name}' styles variant axis '${block.axis}', which is not declared under variants.`,
        file,
        path: block.axis,
        help: 'Declare the axis under variants first, or remove the style block — this CSS would never match anything.',
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
        help: "Add it to that axis's values, or correct the spelling.",
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
          help: 'Declare it under states first — a state styled but not declared is never wired up, so the CSS cannot match.',
        });
      }
    }
  }
  return diagnostics;
}

/** Every token reference must use a known-ish CSS property and resolve per resolveTokenRef's shared rule. */
function checkTokenRefs(ir: ComponentIR, file: string, graphs: Map<string, ResolvedTokenGraph>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const { ref, where } of irTokenRefs(ir)) {
    const property = where.split('.').at(-1)!;
    if (!KNOWN_CSS_PROPERTIES.has(property) && !property.startsWith('-')) {
      diagnostics.push({
        code: 'GIRIH4015',
        severity: 'warning',
        message: `'${ir.name}' styles unknown CSS property '${property}' at ${where} — it will be emitted verbatim.`,
        file,
        path: where,
        help: 'Check the spelling. If it really is a custom or very new property, this warning is expected — the declaration is emitted exactly as written.',
      });
    }

    diagnostics.push(...resolveTokenRef(ref, graphs, { subject: `'${ir.name}'`, ownNamespace: kebabName(ir.name), file, where }));
  }
  return diagnostics;
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
    // Spec files are kebab-case. Lowercasing only the first letter attributed a
    // PaymentButton diagnostic to `paymentButton.contract.ts`, a file that cannot exist.
    const file = ir.sourceFile ?? `components/${kebabName(ir.name)}.contract.ts`;

    diagnostics.push(...checkNameUniqueness(ir, file, seen));

    const resolved = resolveTemplate(ir, file, templates);
    diagnostics.push(...resolved.diagnostics);
    if (!resolved.known) continue;
    const { template } = resolved;

    diagnostics.push(...checkKnownElement(ir, file, template));
    diagnostics.push(...checkParts(ir, file, template));
    diagnostics.push(...checkIdentifiers(ir, file));
    diagnostics.push(...checkVariants(ir, file, template));
    diagnostics.push(...checkStates(ir, file, template));
    diagnostics.push(...checkAria(ir, file));
    diagnostics.push(...checkTokenStates(ir, file));
    diagnostics.push(...checkTokenVariants(ir, file));
    diagnostics.push(...checkTokenRefs(ir, file, graphs));
  }

  return diagnostics;
}
