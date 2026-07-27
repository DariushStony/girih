#!/usr/bin/env node
/**
 * Fail if the committed docs/ differs from a fresh build.
 *
 * Same gate as the `verify` job in .github/workflows/pages.yml, run locally so that a
 * green `pnpm verify` means a green CI. Without it the two disagreed: docs go stale on
 * any source edit that shifts a line number, because the diagnostics reference is
 * extracted as `file:line` for all 68 codes — and `verify` never noticed.
 */
import { execFileSync } from 'node:child_process';

const diff = execFileSync('git', ['diff', '--stat', '--', 'docs/'], { encoding: 'utf8' }).trim();
if (!diff) {
  console.log('✔ docs/ is up to date');
  process.exit(0);
}
console.error('✖ docs/ is stale — a fresh build differs from what is committed:\n');
console.error(diff);
console.error('\nThe regeneration already ran, so the working tree is now correct. Commit it.');
process.exit(1);
