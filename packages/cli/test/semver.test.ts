import { describe, expect, it } from 'vitest';
import { applyBump, diffSignatures } from '../src/semver.js';
import type { ComponentSignature, PublishSignature } from '../src/semver.js';

const button = (): ComponentSignature => ({
  template: 'element',
  templateVersion: 2,
  element: 'button',
  variants: { variant: { values: ['primary', 'secondary'], default: 'primary' } },
  props: { fullWidth: 'false' },
  states: ['hover'],
  childrenRequired: true,
  role: null,
  aria: { loading: ['aria-busy=true'] },
  styles: { 'base|border-radius': '{button.radius}', 'variant.primary|background': '{button.primary.background}' },
});

const base = (): PublishSignature => ({
  tokens: { main: { 'color.primary': '#2563eb', 'button.primary.background': '#2563eb' } },
  components: { Button: button() },
  extensions: { PaymentButton: { extends: 'Button', tokens: { background: '{color.text}' } } },
  ejected: {},
  outputDigest: 'digest-a',
});

const clone = (): PublishSignature => JSON.parse(JSON.stringify(base()));

describe('diffSignatures', () => {
  it('treats the first publish as a minor', () => {
    expect(diffSignatures(null, base()).bump).toBe('minor');
  });

  it('no change → none', () => {
    expect(diffSignatures(base(), clone()).bump).toBe('none');
  });

  it('token value change → patch', () => {
    const next = clone();
    next.tokens.main!['color.primary'] = '#16a34a';
    const diff = diffSignatures(base(), next);
    expect(diff.bump).toBe('patch');
    expect(diff.reasons.join()).toContain("token 'color.primary' value changed");
  });

  it('new variant value / new component → minor', () => {
    const addVariant = clone();
    addVariant.components.Button!.variants.variant!.values.push('danger');
    expect(diffSignatures(base(), addVariant).bump).toBe('minor');

    const addComponent = clone();
    addComponent.components.Card = { ...button(), element: 'div' };
    expect(diffSignatures(base(), addComponent).bump).toBe('minor');
  });

  it('removed variant value / component / token → major', () => {
    const dropVariant = clone();
    dropVariant.components.Button!.variants.variant!.values = ['primary'];
    expect(diffSignatures(base(), dropVariant).bump).toBe('major');

    const dropComponent = clone();
    delete dropComponent.components.Button;
    expect(diffSignatures(base(), dropComponent).bump).toBe('major');

    const dropToken = clone();
    delete dropToken.tokens.main!['button.primary.background'];
    expect(diffSignatures(base(), dropToken).bump).toBe('major');
  });

  it('template version bump → minor; rollback → major', () => {
    const bumped = clone();
    bumped.components.Button!.templateVersion = 3;
    expect(diffSignatures(base(), bumped).bump).toBe('minor');

    const rolledBack = clone();
    rolledBack.components.Button!.templateVersion = 1;
    expect(diffSignatures(base(), rolledBack).bump).toBe('major');
  });

  it('a different template is major even when its version is higher', () => {
    // Regression: identity must be checked before version, or element@2 → checkbox@3 reads as a feature.
    const swapped = clone();
    swapped.components.Button!.template = 'checkbox';
    swapped.components.Button!.templateVersion = 3;
    const diff = diffSignatures(base(), swapped);
    expect(diff.bump).toBe('major');
    expect(diff.reasons.join()).toContain('template changed');
  });

  it('host element, role, and required children are breaking', () => {
    const element = clone();
    element.components.Button!.element = 'a';
    expect(diffSignatures(base(), element).bump).toBe('major');

    const role = clone();
    role.components.Button!.role = 'menuitem';
    expect(diffSignatures(base(), role).bump).toBe('major');

    const children = clone();
    children.components.Button!.childrenRequired = false;
    expect(diffSignatures(base(), children).bump).toBe('minor'); // relaxing a requirement is additive
  });

  it('a restyle that keeps every name and token value still bumps', () => {
    // The styling contract is part of the signature: re-pointing a CSS property at
    // a different (existing, same-valued) token changes the shipped CSS.
    const restyled = clone();
    restyled.components.Button!.styles['variant.primary|background'] = '{color.primary}';
    const diff = diffSignatures(base(), restyled);
    expect(diff.bump).toBe('patch');
    expect(diff.reasons.join()).toContain('style');
  });

  it('variant default and aria wiring changes are minor', () => {
    const defaulted = clone();
    defaulted.components.Button!.variants.variant!.default = 'secondary';
    expect(diffSignatures(base(), defaulted).bump).toBe('minor');

    const aria = clone();
    aria.components.Button!.aria.loading = ['aria-busy=false'];
    expect(diffSignatures(base(), aria).bump).toBe('minor');
  });

  it('extension changes are graded: re-target major, token add minor, ref change patch', () => {
    const retarget = clone();
    retarget.extensions.PaymentButton!.extends = 'Card';
    expect(diffSignatures(base(), retarget).bump).toBe('major');

    const added = clone();
    added.extensions.PaymentButton!.tokens.color = '{color.background}';
    expect(diffSignatures(base(), added).bump).toBe('minor');

    const reref = clone();
    reref.extensions.PaymentButton!.tokens.background = '{color.danger}';
    expect(diffSignatures(base(), reref).bump).toBe('patch');
  });

  it('ejected fork edits bump, because the fork ships in the package', () => {
    const forked = clone();
    forked.ejected = { Button: 'hash-1' };
    expect(diffSignatures(base(), forked).bump).toBe('minor'); // newly ejected

    const withFork = clone();
    withFork.ejected = { Button: 'hash-1' };
    const edited = clone();
    edited.ejected = { Button: 'hash-2' };
    const diff = diffSignatures(withFork, edited);
    expect(diff.bump).toBe('patch');
    expect(diff.reasons.join()).toContain('ejected');
  });

  it('floors to patch when the emitted output changed but no rule matched', () => {
    const next = clone();
    next.outputDigest = 'digest-b';
    const diff = diffSignatures(base(), next);
    expect(diff.bump).toBe('patch');
    expect(diff.reasons.join()).toContain('generated output changed');
  });

  it('takes the highest bump across all changes', () => {
    const next = clone();
    next.tokens.main!['color.primary'] = '#000'; // patch
    next.components.Button!.variants.variant!.values = ['primary']; // major
    expect(diffSignatures(base(), next).bump).toBe('major');
  });
});

describe('applyBump (pre-1.0 convention)', () => {
  it('folds major→minor and minor→patch while below 1.0', () => {
    expect(applyBump('0.0.0', 'minor')).toBe('0.0.1');
    expect(applyBump('0.3.2', 'major')).toBe('0.4.0');
    expect(applyBump('0.3.2', 'minor')).toBe('0.3.3');
    expect(applyBump('0.3.2', 'patch')).toBe('0.3.3');
    expect(applyBump('0.3.2', 'none')).toBe('0.3.2');
  });

  it('uses standard semver at or above 1.0', () => {
    expect(applyBump('1.2.3', 'major')).toBe('2.0.0');
    expect(applyBump('1.2.3', 'minor')).toBe('1.3.0');
    expect(applyBump('1.2.3', 'patch')).toBe('1.2.4');
  });
});
