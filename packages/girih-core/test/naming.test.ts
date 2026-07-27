import { describe, expect, it } from 'vitest';
import { CSS_LAYERS, cssLayer, cssVarName } from '@faravahar/girih-core';

describe('cssVarName', () => {
  it('joins a token path into one lowercase custom property', () => {
    expect(cssVarName('ds', 'color.primary')).toBe('--ds-color-primary');
    expect(cssVarName('ds', ['button', 'radius'])).toBe('--ds-button-radius');
  });
});

describe('cssLayer', () => {
  const wrapped = cssLayer(CSS_LAYERS.components, '.ds-button {\n  color: red;\n}');

  it('declares the order before opening the layer', () => {
    // Order must precede use, or the browser infers it from first appearance.
    expect(wrapped.indexOf('@layer girih.tokens, girih.components;')).toBeLessThan(wrapped.indexOf('@layer girih.components {'));
  });

  it('declares the order in every stylesheet, not just the first', () => {
    // A consumer may import components.css before tokens.css. Whichever loads first
    // has to establish precedence, so both carry the statement; repeating it is
    // idempotent. Without this, import order would silently decide the cascade.
    const tokens = cssLayer(CSS_LAYERS.tokens, ':root { --a: 1px; }');
    for (const sheet of [tokens, wrapped]) {
      expect(sheet).toContain('@layer girih.tokens, girih.components;');
    }
  });

  it('puts components after tokens, so component rules can read token values', () => {
    const order = wrapped.match(/@layer ([^;]+);/)?.[1] ?? '';
    expect(order.indexOf('girih.tokens')).toBeLessThan(order.indexOf('girih.components'));
  });

  it('indents the wrapped content and closes the block', () => {
    expect(wrapped).toContain('  .ds-button {');
    expect(wrapped.trimEnd().endsWith('}')).toBe(true);
    const bare = wrapped.replace(/\/\*[\s\S]*?\*\//g, '');
    expect((bare.match(/\{/g) ?? []).length).toBe((bare.match(/\}/g) ?? []).length);
  });

  it('leaves blank lines blank rather than indenting whitespace', () => {
    expect(cssLayer(CSS_LAYERS.tokens, 'a {\n}\n\nb {\n}')).not.toMatch(/^ +$/m);
  });
});
