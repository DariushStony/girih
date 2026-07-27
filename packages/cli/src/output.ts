import pc from 'picocolors';
import type { Diagnostic } from '@faravahar/girih-core';

export function printDiagnostics(diagnostics: readonly Diagnostic[]): void {
  for (const d of diagnostics) {
    const badge =
      d.severity === 'error'
        ? pc.bgRed(pc.white(' ERROR '))
        : d.severity === 'warning'
          ? pc.bgYellow(pc.black(' WARN '))
          : pc.bgBlue(pc.white(' INFO '));
    const location = [d.file, d.path && pc.cyan(d.path)].filter(Boolean).join(' › ');
    console.log(`${badge} ${pc.dim(d.code)} ${d.message}${location ? `\n        ${pc.dim(location)}` : ''}`);
    if (d.help) console.log(`        ${pc.green('help:')} ${d.help}`);
  }
}

export function printSummaryLine(diagnostics: readonly Diagnostic[]): void {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  if (errors > 0) {
    console.log(pc.red(`\n✖ ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`));
  } else if (warnings > 0) {
    console.log(pc.yellow(`\n⚠ ${warnings} warning${warnings === 1 ? '' : 's'}`));
  } else {
    console.log(pc.green('\n✔ no problems'));
  }
}

export function table(rows: string[][], header: string[]): string {
  const all = [header, ...rows];
  const widths = header.map((_, col) => Math.max(...all.map((row) => stripAnsi(row[col] ?? '').length)));
  const line = (row: string[], pad = ' ') =>
    row.map((cell, col) => cell + pad.repeat(widths[col]! - stripAnsi(cell).length)).join('  ');
  return [pc.bold(line(header)), line(widths.map((w) => '─'.repeat(w)), '─'), ...rows.map((r) => line(r))].join('\n');
}

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}
