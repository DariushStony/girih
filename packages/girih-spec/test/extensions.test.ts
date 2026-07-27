import { describe, expect, it } from 'vitest';
import { buildTokenGraphs } from '@faravahar/girih-tokens';
import { defineSpec, defineVariant, isVariantExtension, specToIR, validateExtensions, validateSpecs } from '@faravahar/girih-spec';
import type { LoadedExtension, TemplateCapabilities } from '@faravahar/girih-spec';
import { acmeConfig } from '../../girih-tokens/test/fixture.js';

const buttonIR = (allowExtends = true) =>
  specToIR(
    defineSpec({
      name: 'Button',
      element: 'button',
      tokens: { base: { background: '{button.primary.background}' } },
      accessibility: { focusable: true },
      extensibility: { allowExtends, overridableTokens: ['background', 'color'] },
    }),
  ).ir;

const loaded = (extension: ReturnType<typeof defineVariant>): LoadedExtension => ({
  file: 'extensions/test.ext.ts',
  extension,
});

describe('validateExtensions', () => {
  it('accepts a valid extension', async () => {
    const { graphs } = await buildTokenGraphs(acmeConfig);
    const extension = defineVariant({ name: 'PaymentButton', extends: 'Button', tokens: { background: '{color.text}' } });
    expect(isVariantExtension(extension)).toBe(true);
    expect(validateExtensions([loaded(extension)], [buttonIR()], graphs)).toEqual([]);
  });

  it('rejects unknown base (GIRIH4034), forbidden extends (GIRIH4035), non-overridable props (GIRIH4036)', async () => {
    const { graphs } = await buildTokenGraphs(acmeConfig);
    const unknownBase = defineVariant({ name: 'A', extends: 'Ghost', tokens: {} });
    expect(validateExtensions([loaded(unknownBase)], [buttonIR()], graphs).some((d) => d.code === 'GIRIH4034')).toBe(true);

    const notAllowed = defineVariant({ name: 'B', extends: 'Button', tokens: {} });
    expect(validateExtensions([loaded(notAllowed)], [buttonIR(false)], graphs).some((d) => d.code === 'GIRIH4035')).toBe(true);

    const overreach = defineVariant({ name: 'C', extends: 'Button', tokens: { borderRadius: '{radius.control}' } });
    expect(validateExtensions([loaded(overreach)], [buttonIR()], graphs).some((d) => d.code === 'GIRIH4036')).toBe(true);
  });

  it('rejects refs no brand resolves (GIRIH4002) and dialog bases (GIRIH4037)', async () => {
    const { graphs } = await buildTokenGraphs(acmeConfig);
    const badRef = defineVariant({ name: 'D', extends: 'Button', tokens: { background: '{color.golden}' } });
    expect(validateExtensions([loaded(badRef)], [buttonIR()], graphs).some((d) => d.code === 'GIRIH4002')).toBe(true);

    const dialog = specToIR(
      defineSpec({
        name: 'Dialog',
        template: 'dialog',
        tokens: {},
        accessibility: { focusable: false },
        extensibility: { allowExtends: true, overridableTokens: [] },
      }),
    ).ir;
    const onDialog = defineVariant({ name: 'E', extends: 'Dialog', tokens: {} });
    expect(validateExtensions([loaded(onDialog)], [dialog], graphs).some((d) => d.code === 'GIRIH4037')).toBe(true);
  });
});

describe('template capabilities', () => {
  const TEMPLATES: Record<string, TemplateCapabilities> = {
    element: { version: 1, states: ['hover', 'disabled'], parts: [] },
    dialog: { version: 1, states: [], parts: ['backdrop', 'popup'], fixedElement: 'div' },
  };

  it('rejects states a template does not implement (GIRIH4008) and unknown templates (GIRIH4040)', async () => {
    const { graphs } = await buildTokenGraphs(acmeConfig);
    const ir = specToIR(
      defineSpec({
        name: 'Chip',
        element: 'span',
        states: ['loading'],
        tokens: {},
        accessibility: { focusable: false },
      }),
    ).ir;
    expect(validateSpecs([ir], graphs, TEMPLATES).some((d) => d.code === 'GIRIH4008')).toBe(true);

    const unknown = { ...ir, template: 'carousel' };
    expect(validateSpecs([unknown], graphs, TEMPLATES).some((d) => d.code === 'GIRIH4040')).toBe(true);
  });

  it('rejects parts a template does not declare (GIRIH4041)', async () => {
    const { graphs } = await buildTokenGraphs(acmeConfig);
    const ir = specToIR(
      defineSpec({
        name: 'Modal',
        template: 'dialog',
        tokens: { parts: { footer: { background: '{color.surface}' } } },
        accessibility: { focusable: false },
      }),
    ).ir;
    expect(validateSpecs([ir], graphs, TEMPLATES).some((d) => d.code === 'GIRIH4041')).toBe(true);
  });
});
