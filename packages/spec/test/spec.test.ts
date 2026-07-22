import { describe, expect, it } from 'vitest';
import { buildTokenGraphs } from '@girih/tokens';
import { defineSpec, isSpec, specToIR, validateSpecs } from '@girih/spec';
import type { ComponentSpecInput } from '@girih/spec';
import { acmeConfig } from '../../tokens/test/fixture.js';

const buttonSpec = (): ComponentSpecInput =>
  defineSpec({
    name: 'Button',
    element: 'button',
    variants: {
      variant: { values: ['primary', 'secondary'], default: 'primary' },
      size: { values: ['sm', 'md'], default: 'md' },
    },
    states: ['hover', 'loading'],
    slots: { children: { required: true } },
    tokens: {
      base: { borderRadius: '{button.radius}' },
      variants: {
        variant: {
          primary: {
            background: '{button.primary.background}',
            color: '{button.primary.foreground}',
            states: { hover: { background: '{button.primary.background-hover}' } },
          },
          secondary: { background: '{button.secondary.background}' },
        },
        size: {
          sm: { height: '{button.size.sm.height}' },
          md: { height: '{button.size.md.height}' },
        },
      },
    },
    accessibility: { focusable: true, aria: { loading: { 'aria-busy': 'true' } } },
  });

describe('defineSpec / specToIR', () => {
  it('brands specs so the loader can tell them from arbitrary objects', () => {
    expect(isSpec(buttonSpec())).toBe(true);
    expect(isSpec({ name: 'Button' })).toBe(false);
  });

  it('normalizes to a canonical IR (kebab-cased properties, explicit defaults)', () => {
    const { ir, diagnostics } = specToIR(buttonSpec());
    expect(diagnostics).toEqual([]);
    expect(ir.variants).toEqual([
      { axis: 'variant', values: ['primary', 'secondary'], default: 'primary' },
      { axis: 'size', values: ['sm', 'md'], default: 'md' },
    ]);
    expect(ir.tokens.base).toEqual([{ property: 'border-radius', ref: '{button.radius}' }]);
    const primary = ir.tokens.variants.find((b) => b.axis === 'variant' && b.value === 'primary')!;
    expect(primary.states).toEqual([
      { state: 'hover', declarations: [{ property: 'background', ref: '{button.primary.background-hover}' }] },
    ]);
    expect(ir.childrenRequired).toBe(true);
  });
});

describe('validateSpecs against the acme-ds brand graphs', () => {
  it('accepts a spec whose refs resolve in every brand', async () => {
    const { graphs } = await buildTokenGraphs(acmeConfig);
    expect(validateSpecs([specToIR(buttonSpec()).ir], graphs)).toEqual([]);
  });

  it('rejects references no brand resolves (GIRIH4002)', async () => {
    const { graphs } = await buildTokenGraphs(acmeConfig);
    const spec = buttonSpec();
    spec.tokens!.base!.borderRadius = '{button.radius-typo}';
    const diagnostics = validateSpecs([specToIR(spec).ir], graphs);
    expect(diagnostics.some((d) => d.code === 'GIRIH4002' && d.severity === 'error')).toBe(true);
  });

  it('warns on global-tier references (GIRIH4003)', async () => {
    const { graphs } = await buildTokenGraphs(acmeConfig);
    const spec = buttonSpec();
    spec.tokens!.base!.fontSize = '{font.size.md}';
    const diagnostics = validateSpecs([specToIR(spec).ir], graphs);
    expect(diagnostics.some((d) => d.code === 'GIRIH4003' && d.severity === 'warning')).toBe(true);
  });

  it('rejects a default outside the axis values (GIRIH4007)', async () => {
    const { graphs } = await buildTokenGraphs(acmeConfig);
    const spec = buttonSpec();
    spec.variants!.variant!.default = 'ghost';
    const diagnostics = validateSpecs([specToIR(spec).ir], graphs);
    expect(diagnostics.some((d) => d.code === 'GIRIH4007')).toBe(true);
  });

  it('rejects styling an undeclared state (GIRIH4011) and unsupported states (GIRIH4008)', async () => {
    const { graphs } = await buildTokenGraphs(acmeConfig);
    const spec = buttonSpec();
    spec.states = ['pressed' as never];
    const diagnostics = validateSpecs([specToIR(spec).ir], graphs);
    expect(diagnostics.some((d) => d.code === 'GIRIH4008')).toBe(true);
    expect(diagnostics.some((d) => d.code === 'GIRIH4011')).toBe(true); // hover styled but no longer declared
  });

  it('rejects axis/prop names that collide with template-reserved names (GIRIH4013)', async () => {
    const { graphs } = await buildTokenGraphs(acmeConfig);
    const spec = buttonSpec();
    spec.variants!.loading = { values: ['spin', 'bar'], default: 'spin' };
    spec.props = { variant: { type: 'boolean' } }; // also collides with the axis
    const diagnostics = validateSpecs([specToIR(spec).ir], graphs);
    const collisions = diagnostics.filter((d) => d.code === 'GIRIH4013' && d.severity === 'error');
    expect(collisions.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects aria mappings for undeclared states (GIRIH4016)', async () => {
    const { graphs } = await buildTokenGraphs(acmeConfig);
    const spec = buttonSpec();
    spec.accessibility = { aria: { disabled: { 'aria-disabled': 'true' } } }; // 'disabled' not in states
    const diagnostics = validateSpecs([specToIR(spec).ir], graphs);
    expect(diagnostics.some((d) => d.code === 'GIRIH4016' && d.severity === 'error')).toBe(true);
  });

  it('warns on unknown CSS properties (GIRIH4015)', async () => {
    const { graphs } = await buildTokenGraphs(acmeConfig);
    const spec = buttonSpec();
    spec.tokens!.base = { colour: '{button.radius}' } as never;
    const diagnostics = validateSpecs([specToIR(spec).ir], graphs);
    expect(diagnostics.some((d) => d.code === 'GIRIH4015' && d.severity === 'warning')).toBe(true);
  });
});

describe('specToIR robustness', () => {
  it('reports non-string declaration values instead of dropping them (GIRIH4014)', () => {
    const spec = buttonSpec();
    spec.tokens!.variants!.variant!.primary = {
      background: '{button.primary.background}',
      hover: { background: '{button.primary.background-hover}' }, // misplaced — should be under states
    } as never;
    const { diagnostics } = specToIR(spec);
    expect(diagnostics.some((d) => d.code === 'GIRIH4014' && d.severity === 'error')).toBe(true);
    expect(diagnostics[0]!.help).toContain('states');
  });

  it('tolerates a spec without a tokens field', () => {
    const spec = defineSpec({ name: 'Divider', element: 'div', accessibility: { focusable: false } });
    const { ir, diagnostics } = specToIR(spec);
    expect(diagnostics).toEqual([]);
    expect(ir.tokens).toEqual({ base: [], baseStates: [], variants: [], parts: [] });
  });

  it('kebab-cases vendor prefixes with a leading dash', async () => {
    const { kebabCase } = await import('@girih/spec');
    expect(kebabCase('WebkitMaskImage')).toBe('-webkit-mask-image');
    expect(kebabCase('paddingInline')).toBe('padding-inline');
  });
});
