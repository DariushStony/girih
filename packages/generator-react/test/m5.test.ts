import { describe, expect, it } from 'vitest';
import { defineSpec, defineVariant, specToIR } from '@faravahar/girih-spec';
import {
  generateReact,
  renderCheckboxComponent,
  renderComponentCss,
  renderDialogComponent,
} from '@faravahar/girih-generator-react';

const OPTS = { classPrefix: 'ds', runtimePackage: '@faravahar/girih-react-runtime' };

const checkboxIR = () =>
  specToIR(
    defineSpec({
      name: 'Checkbox',
      template: 'checkbox',
      variants: { size: { values: ['sm', 'md'], default: 'md' } },
      states: ['hover', 'focus-visible', 'disabled', 'checked'],
      tokens: {
        base: { background: '{checkbox.background}', borderColor: '{checkbox.border}' },
        states: { checked: { background: '{checkbox.background-checked}', color: '{checkbox.glyph}' } },
        variants: { size: { sm: { width: '{checkbox.size.sm}' }, md: { width: '{checkbox.size.md}' } } },
      },
      accessibility: { focusable: true },
    }),
  ).ir;

const dialogIR = () =>
  specToIR(
    defineSpec({
      name: 'Dialog',
      template: 'dialog',
      variants: { size: { values: ['sm', 'md'], default: 'md' } },
      tokens: {
        parts: {
          backdrop: { background: '{dialog.backdrop}' },
          popup: { background: '{dialog.surface}', borderRadius: '{dialog.radius}' },
          title: { fontSize: '{typography.size-lg}' },
        },
        variants: { size: { sm: { maxWidth: '{dialog.size.sm.max-width}' } } },
      },
      accessibility: { focusable: false },
    }),
  ).ir;

const buttonIR = () =>
  specToIR(
    defineSpec({
      name: 'Button',
      element: 'button',
      variants: { variant: { values: ['primary', 'secondary'], default: 'primary' } },
      slots: { children: { required: true } },
      tokens: {
        base: { borderRadius: '{button.radius}' },
        variants: {
          variant: {
            primary: { background: '{button.primary.background}' },
            secondary: { background: '{button.secondary.background}' },
          },
        },
      },
      accessibility: { focusable: true },
      extensibility: { allowExtends: true, overridableTokens: ['background', 'color'] },
    }),
  ).ir;

describe('checkbox template', () => {
  it('renders a styled native checkbox — semantics for free, visuals from tokens', () => {
    const tsx = renderCheckboxComponent(checkboxIR(), OPTS);
    expect(tsx).toContain('type="checkbox"');
    expect(tsx).toContain("Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'size'>"); // native size?: number must not clash
    expect(tsx).toContain('data-size={size}');
    expect(tsx).toContain('forwardRef<HTMLInputElement, CheckboxProps>');
  });

  it('draws the box and glyph structurally, colors via base-state tokens', () => {
    const css = renderComponentCss(checkboxIR(), { prefix: 'ds', classPrefix: 'ds' });
    expect(css).toContain('appearance: none;');
    expect(css).toContain('.ds-checkbox:checked::after');
    expect(css).toContain('.ds-checkbox:checked {\n  background: var(--ds-checkbox-background-checked);');
  });
});

describe('dialog template', () => {
  it('delegates behavior to the Base UI adapter and styles parts', () => {
    const tsx = renderDialogComponent(dialogIR(), OPTS);
    expect(tsx).toContain("import { BaseDialog } from './internal/headless'");
    expect(tsx).toContain('Root: BaseDialog.Root');
    expect(tsx).toContain("className=\"ds-dialog-backdrop\"");
    expect(tsx).toContain('data-size={size}');

    const css = renderComponentCss(dialogIR(), { prefix: 'ds', classPrefix: 'ds' });
    expect(css).toContain('.ds-dialog-backdrop {\n  background: var(--ds-dialog-backdrop);');
    expect(css).toContain('.ds-dialog-popup[data-size="sm"] {\n  max-width: var(--ds-dialog-size-sm-max-width);');
  });

  it('adds the pinned headless dependency only when a dialog is in the catalog', () => {
    const withDialog = generateReact([dialogIR()], { packageName: '@t/ds', prefix: 'ds' });
    const withoutDialog = generateReact([buttonIR()], { packageName: '@t/ds', prefix: 'ds' });
    const dep = (result: typeof withDialog) =>
      JSON.parse(result.files.find((f) => f.path === 'package.json')!.contents).dependencies['@base-ui-components/react'];
    expect(dep(withDialog)).toBe('1.0.0-rc.0');
    expect(dep(withoutDialog)).toBeUndefined();
    expect(withDialog.files.some((f) => f.path === 'src/internal/headless.ts')).toBe(true);
    expect(withoutDialog.files.some((f) => f.path === 'src/internal/headless.ts')).toBe(false);
  });
});

describe('extensions', () => {
  it('emits a wrapper component and CSS that rides the base class after variant blocks', () => {
    const extension = defineVariant({
      name: 'PaymentButton',
      extends: 'Button',
      tokens: { background: '{color.text}' },
    });
    const result = generateReact([buttonIR()], { packageName: '@t/ds', prefix: 'ds' }, { extensions: [{ file: 'extensions/payment-button.ext.ts', extension }] });

    const tsx = result.files.find((f) => f.path === 'src/PaymentButton.tsx')!.contents;
    expect(tsx).toContain("import { Button } from './Button'");
    expect(tsx).toContain("cx('ds-x-payment-button', className)");
    expect(tsx).toContain('forwardRef<HTMLButtonElement, ButtonProps>');

    const css = result.files.find((f) => f.path === 'styles/components.css')!.contents;
    const extensionAt = css.indexOf('.ds-button.ds-x-payment-button.ds-x-payment-button');
    const variantAt = css.indexOf('.ds-button[data-variant="primary"]');
    expect(extensionAt).toBeGreaterThan(variantAt); // source order = extension wins ties

    const index = result.files.find((f) => f.path === 'src/index.ts')!.contents;
    expect(index).toContain("export { PaymentButton } from './PaymentButton';");
  });

  it('stitches ejected sources verbatim while CSS stays generated', () => {
    const result = generateReact(
      [buttonIR()],
      { packageName: '@t/ds', prefix: 'ds' },
      { ejected: { Button: '// user-owned fork\nexport const Button = null as never;\n' } },
    );
    expect(result.files.find((f) => f.path === 'src/Button.tsx')!.contents).toContain('user-owned fork');
    expect(result.files.find((f) => f.path === 'styles/components.css')!.contents).toContain(
      '.ds-button[data-variant="primary"]',
    );
  });
});
