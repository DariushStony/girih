import { describe, expect, it } from 'vitest';
import { defineSpec, specToIR } from '@faravahar/girih-spec';
import { renderCheckboxComponent, renderComponentCss, renderElementComponent, TEMPLATE_REGISTRY } from '@faravahar/girih-generator-react';

const ir = (states: string[], template?: 'element' | 'checkbox') =>
  specToIR(
    defineSpec({
      name: 'Field',
      ...(template ? { template } : {}),
      element: 'input',
      states: states as never,
      tokens: { states: { invalid: { borderColor: '{field.border-invalid}' } } },
      accessibility: { focusable: true },
    }),
  ).ir;

const options = { classPrefix: 'ds', runtimePackage: '@faravahar/girih-react-runtime' };

// A red border with nothing announced is the failure mode this state exists to prevent:
// the same prop must drive the styling hook and the accessible state together.
describe('the invalid state', () => {
  it('emits aria-invalid alongside data-invalid from one prop', () => {
    const tsx = renderElementComponent(ir(['invalid']), options);
    expect(tsx).toContain('invalid?: boolean;');
    expect(tsx).toContain('invalid = false');
    expect(tsx).toContain('data-invalid={invalid || undefined}');
    expect(tsx).toContain('aria-invalid={invalid || undefined}');
  });

  it('does the same in the checkbox template', () => {
    const tsx = renderCheckboxComponent(ir(['invalid'], 'checkbox'), options);
    expect(tsx).toContain('invalid?: boolean;');
    expect(tsx).toContain('data-invalid={invalid || undefined}');
    expect(tsx).toContain('aria-invalid={invalid || undefined}');
  });

  it('adds nothing when the contract does not declare it', () => {
    const tsx = renderElementComponent(ir(['hover']), options);
    expect(tsx).not.toContain('invalid');
  });

  it('styles the announced attribute, so a hand-set aria-invalid is styled too', () => {
    const css = renderComponentCss(ir(['invalid']), { prefix: 'ds', classPrefix: 'ds' });
    expect(css).toContain('.ds-field[aria-invalid="true"]');
    // Still a live var() — the invalid colour has to rebrand like everything else.
    expect(css).toContain('var(--ds-field-border-invalid)');
    expect(css).not.toMatch(/border-color:\s*#/);
  });

  it('is declared as a capability by both templates that implement it', () => {
    // Contracts are validated against these, so an unlisted state is rejected
    // (GIRIH4008) rather than silently emitting markup with no styling.
    expect(TEMPLATE_REGISTRY['element']?.states).toContain('invalid');
    expect(TEMPLATE_REGISTRY['checkbox']?.states).toContain('invalid');
    expect(TEMPLATE_REGISTRY['dialog']?.states).not.toContain('invalid');
  });
});
