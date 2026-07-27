/**
 * Programmatic surface of the CLI. `defineConfig` and `defineSpec` are
 * re-exported here so user workspaces only ever depend on @faravahar/girih.
 */
export { defineConfig } from '@faravahar/girih-core';
export type { GirihConfig } from '@faravahar/girih-core';
export { defineSpec, defineVariant } from '@faravahar/girih-spec';
export type { ComponentSpecInput, ComponentState, VariantExtensionInput } from '@faravahar/girih-spec';
export { scaffoldWorkspace, workspaceTemplate } from './scaffold.js';
export type { ScaffoldOptions, ScaffoldResult } from './scaffold.js';
