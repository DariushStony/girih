import type { TemplateCapabilities } from '@faravahar/girih-spec';

/**
 * The hand-maintained template catalog. Versions are recorded in ds.lock at
 * eject time so future template updates can 3-way merge against the exact
 * base a fork started from.
 */
export const TEMPLATE_REGISTRY: Record<string, TemplateCapabilities> = {
  element: {
    version: 3, // v3: invalid state -> data-invalid + aria-invalid
    states: ['hover', 'active', 'focus-visible', 'disabled', 'loading', 'invalid'],
    parts: [],
  },
  checkbox: {
    version: 2, // v2: invalid state -> data-invalid + aria-invalid
    states: ['hover', 'focus-visible', 'disabled', 'checked', 'invalid'],
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
