/**
 * Programmatic surface of the CLI. `defineConfig` is re-exported here so user
 * workspaces only ever depend on @girih/cli.
 */
export { defineConfig } from '@girih/core';
export type { GirihConfig } from '@girih/core';
