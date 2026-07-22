import type { TemplateCapabilities } from '@girih/spec';

/**
 * The hand-maintained template catalog. Versions are recorded in ds.lock at
 * eject time so future template updates can 3-way merge against the exact
 * base a fork started from.
 */
export const TEMPLATE_REGISTRY: Record<string, TemplateCapabilities> = {
  element: {
    version: 2, // v2: non-native disabled prop, type="button" default, focus ring
    states: ['hover', 'active', 'focus-visible', 'disabled', 'loading'],
    parts: [],
  },
  checkbox: {
    version: 1,
    states: ['hover', 'focus-visible', 'disabled', 'checked'],
    parts: [],
    fixedElement: 'input',
  },
  dialog: {
    version: 1,
    states: [],
    parts: ['backdrop', 'popup', 'title', 'description'],
    fixedElement: 'div',
    variantAxes: ['size'],
  },
};
