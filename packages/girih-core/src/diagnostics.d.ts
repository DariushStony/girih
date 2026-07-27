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
export declare class DiagnosticBag {
  private items;
  add(diagnostic: Diagnostic): void;
  addAll(diagnostics: Iterable<Diagnostic>): void;
  get all(): readonly Diagnostic[];
  get errors(): Diagnostic[];
  get warnings(): Diagnostic[];
  hasErrors(): boolean;
}
export declare function formatDiagnostic(d: Diagnostic): string;
//# sourceMappingURL=diagnostics.d.ts.map
