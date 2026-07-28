export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  /** Stable machine-readable code, e.g. 'GIRIH2003'. */
  code: string;
  severity: Severity;
  message: string;
  /** Workspace-relative file the problem originates from, when known. */
  file?: string;
  /** Token or component path, e.g. 'button.primary.background'. */
  path?: string;
  /** One-line suggestion for fixing the problem. */
  help?: string;
}

/** Whether any diagnostic in the list is fatal — the one check every command runs before proceeding. */
export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}
