/**
 * Programmatic surface of the CLI. `defineConfig` and `defineSpec` are
 * re-exported here so user workspaces only ever depend on @girih/cli.
 */
export { defineConfig } from '@girih/core';
export type { GirihConfig } from '@girih/core';
export { defineSpec } from '@girih/spec';
export type { ComponentSpecInput, ComponentState } from '@girih/spec';
export { scaffoldWorkspace, workspaceTemplate } from './scaffold.js';
export type { ScaffoldOptions, ScaffoldResult } from './scaffold.js';
