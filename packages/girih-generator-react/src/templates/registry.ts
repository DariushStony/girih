import type { ComponentIR, TemplateCapabilities } from '@faravahar/girih-spec';
import { checkboxStructuralCss, renderCheckboxComponent } from './checkbox.js';
import { dialogStructuralCss, renderDialogComponent } from './dialog.js';
import { elementStructuralCss, renderElementComponent } from './element.js';
import type { TemplateOptions } from './element.js';

/**
 * A template's capabilities (consumed by girih-spec for contract validation) plus its
 * render and structural-CSS implementations (consumed by generate.ts and css.ts). One
 * entry per template name so a new template cannot ship wired into generation but
 * forgotten in validation, or the reverse — every caller does the same `registry[name]`
 * lookup instead of its own if/else chain that has to be kept in sync by hand.
 */
export interface TemplateEntry extends TemplateCapabilities {
  render: (ir: ComponentIR, options: TemplateOptions) => string;
  /** `base` is the CSS class selector including its leading dot, e.g. '.ds-button'. */
  structuralCss: (ir: ComponentIR, base: string, prefix: string) => string[];
}

export const TEMPLATE_REGISTRY: Record<string, TemplateEntry> = {
  element: {
    version: 3, // v3: invalid state -> data-invalid + aria-invalid
    states: ['hover', 'active', 'focus-visible', 'disabled', 'loading', 'invalid'],
    parts: [],
    render: renderElementComponent,
    structuralCss: (ir, base) => elementStructuralCss(ir, base),
  },
  checkbox: {
    version: 2, // v2: invalid state -> data-invalid + aria-invalid
    states: ['hover', 'focus-visible', 'disabled', 'checked', 'invalid'],
    parts: [],
    fixedElement: 'input',
    render: renderCheckboxComponent,
    structuralCss: (_ir, base) => checkboxStructuralCss(base),
  },
  dialog: {
    version: 1,
    states: [],
    parts: ['backdrop', 'popup', 'title', 'description'],
    fixedElement: 'div',
    variantAxes: ['size'],
    render: renderDialogComponent,
    // dialogStructuralCss owns its own leading dot per selector — strip the one `base` already carries.
    structuralCss: (_ir, base, prefix) => dialogStructuralCss(base.slice(1), prefix),
  },
};
