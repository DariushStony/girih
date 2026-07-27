import type { ComponentSpecInput } from './types.js';

const SPEC_BRAND = Symbol.for('girih.spec');

/**
 * Typed identity helper for components/*.spec.ts authors. The brand symbol lets
 * the loader distinguish a real spec export from an arbitrary object.
 */
export function defineSpec(spec: ComponentSpecInput): ComponentSpecInput {
  return Object.defineProperty({ ...spec }, SPEC_BRAND, { value: true, enumerable: false });
}

export function isSpec(value: unknown): value is ComponentSpecInput {
  return typeof value === 'object' && value !== null && SPEC_BRAND in value;
}
