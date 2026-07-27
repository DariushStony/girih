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

export class DiagnosticBag {
  private items: Diagnostic[] = [];

  add(diagnostic: Diagnostic): void {
    this.items.push(diagnostic);
  }

  addAll(diagnostics: Iterable<Diagnostic>): void {
    for (const d of diagnostics) this.items.push(d);
  }

  get all(): readonly Diagnostic[] {
    return this.items;
  }

  get errors(): Diagnostic[] {
    return this.items.filter((d) => d.severity === 'error');
  }

  get warnings(): Diagnostic[] {
    return this.items.filter((d) => d.severity === 'warning');
  }

  hasErrors(): boolean {
    return this.items.some((d) => d.severity === 'error');
  }
}

export function formatDiagnostic(d: Diagnostic): string {
  const location = [d.file, d.path].filter(Boolean).join(' › ');
  const head = `${d.severity} ${d.code}: ${d.message}`;
  const parts = [location ? `${head} (${location})` : head];
  if (d.help) parts.push(`  help: ${d.help}`);
  return parts.join('\n');
}
