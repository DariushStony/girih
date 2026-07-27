export type {
  TokenRef,
  ComponentState,
  ComponentSpecInput,
  VariantAxisInput,
  VariantTokenBlockInput,
  ComponentIR,
  VariantAxisIR,
  VariantBlockIR,
  StyleRuleIR,
} from './types.js';
export { SUPPORTED_STATES } from './types.js';
export { defineSpec, isSpec } from './define.js';
export { specToIR, irTokenRefs, kebabCase } from './ir.js';
export type { SpecToIRResult } from './ir.js';
export { validateSpecs } from './validate.js';
export type { TemplateCapabilities } from './validate.js';
export { loadSpecs } from './load.js';
export type { LoadedSpec, LoadSpecsResult } from './load.js';
export { defineVariant, isVariantExtension, loadExtensions, validateExtensions } from './extensions.js';
export type { LoadedExtension } from './extensions.js';
export type { VariantExtensionInput } from './types.js';
