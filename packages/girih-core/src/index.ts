export type { Severity, Diagnostic } from './diagnostics.js';
export { DiagnosticBag, formatDiagnostic } from './diagnostics.js';
export type { GirihConfig, ResolvedConfig, ResolvedBrand, LoadConfigResult } from './config.js';
export { defineConfig, loadConfig, CONFIG_FILENAMES } from './config.js';
export type { EmittedFile } from './files.js';
export { emittedFile, writeEmittedFiles, verifyEmittedFiles } from './files.js';
export { cssVarName, cssLayer, kebabName, CSS_LAYERS } from './naming.js';
