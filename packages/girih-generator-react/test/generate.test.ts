import { describe, expect, it } from 'vitest';
import { defineSpec, specToIR } from '@faravahar/girih-spec';
import { generateReact } from '@faravahar/girih-generator-react';
import { renderComponentCss } from '../src/css.js';
import { renderElementComponent } from '../src/templates/element.js';

const buttonIR = () =>
  specToIR(
    defineSpec({
      name: 'Button',
      description: 'Triggers an action.',
      element: 'button',
      variants: {
        variant: { values: ['primary', 'secondary'], default: 'primary' },
        size: { values: ['sm', 'md'], default: 'md' },
      },
      states: ['hover', 'disabled', 'loading'],
      slots: { children: { required: true } },
      tokens: {
        base: { borderRadius: '{button.radius}' },
        variants: {
          variant: {
            primary: {
              background: '{button.primary.background}',
              states: { hover: { background: '{button.primary.background-hover}' } },
            },
          },
        },
      },
      accessibility: { focusable: true, aria: { loading: { 'aria-busy': 'true' } } },
    }),
  ).ir;

describe('renderElementComponent', () => {
  it('emits typed variant unions, data attributes, and capability-driven props', () => {
    const tsx = renderElementComponent(buttonIR(), { classPrefix: 'ds', runtimePackage: '@faravahar/girih-react-runtime' });
    expect(tsx).toContain("export type ButtonVariant = 'primary' | 'secondary';");
    expect(tsx).toContain("export type ButtonSize = 'sm' | 'md';");
    expect(tsx).toContain("extends Omit<ComponentPropsWithoutRef<'button'>, 'variant' | 'size'>"); // axes shadow native attrs
    expect(tsx).toContain('data-variant={variant}');
    expect(tsx).toContain('data-loading={loading || undefined}');
    expect(tsx).toContain("aria-busy={loading ? 'true' : undefined}");
    expect(tsx).toContain('disabled={disabled || loading}'); // loading blocks interaction on native elements
    expect(tsx).toContain("type = 'button'"); // buttons in forms must not submit by default
    expect(tsx).toContain('type={type}');
    expect(tsx).toContain('forwardRef<HTMLButtonElement, ButtonProps>');
    expect(tsx).toContain('{children}');
  });

  it('gives non-native elements a real disabled prop wired to aria-disabled', () => {
    const chip = specToIR(
      defineSpec({
        name: 'Chip',
        element: 'span',
        states: ['disabled'],
        tokens: { base: { color: '{color.text}' } },
        accessibility: { focusable: false },
      }),
    ).ir;
    const tsx = renderElementComponent(chip, { classPrefix: 'ds', runtimePackage: '@faravahar/girih-react-runtime' });
    expect(tsx).toContain('disabled?: boolean;');
    expect(tsx).toContain('disabled = false');
    expect(tsx).toContain("aria-disabled={disabled ? 'true' : undefined}");
    expect(tsx).not.toContain('disabled={disabled}'); // spans have no native disabled attribute
  });
});

describe('renderComponentCss', () => {
  it('emits structural template CSS plus token var() plumbing — never literal design values', () => {
    const css = renderComponentCss(buttonIR(), { prefix: 'ds', classPrefix: 'ds' });
    expect(css).toContain('display: inline-flex;'); // template-owned structure
    expect(css).toContain('cursor: not-allowed;');
    expect(css).toContain('.ds-button {\n  border-radius: var(--ds-button-radius);\n}');
    expect(css).toContain('.ds-button[data-variant="primary"] {\n  background: var(--ds-button-primary-background);\n}');
    expect(css).toContain(
      '.ds-button[data-variant="primary"]:hover:not(:disabled):not([aria-disabled="true"]) {\n  background: var(--ds-button-primary-background-hover);\n}',
    );
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/); // no literal colors, ever
  });
});

describe('generateReact', () => {
  it('emits the package skeleton and is byte-deterministic', () => {
    const a = generateReact([buttonIR()], { packageName: '@acme/design-system', prefix: 'ds' });
    const b = generateReact([buttonIR()], { packageName: '@acme/design-system', prefix: 'ds' });
    expect(a.files.map((f) => f.path)).toEqual(['src/button.tsx', 'styles/components.css', 'src/index.ts', 'package.json', 'README.md']);
    expect(a.files.map((f) => f.hash)).toEqual(b.files.map((f) => f.hash));

    const index = a.files.find((f) => f.path === 'src/index.ts')!.contents;
    expect(index).toContain("export { Button } from './button';");
    expect(index).toContain("export { BrandProvider, useBrand, cx } from '@faravahar/girih-react-runtime';");

    const pkg = JSON.parse(a.files.find((f) => f.path === 'package.json')!.contents);
    expect(pkg.name).toBe('@acme/design-system');
    expect(pkg.peerDependencies.react).toBe('>=18');
  });
});
