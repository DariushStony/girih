import { createJiti } from 'jiti';
import { join } from 'node:path';
import { glob } from 'tinyglobby';
import type { Diagnostic, ResolvedConfig } from '@faravahar/girih-core';
import { isSpec } from './define.js';
import type { ComponentSpecInput } from './types.js';

export interface LoadedSpec {
  file: string;
  spec: ComponentSpecInput;
}

export interface LoadSpecsResult {
  specs: LoadedSpec[];
  diagnostics: Diagnostic[];
}

const DEFAULT_SPEC_GLOB = 'design/components/**/*.contract.ts';

/**
 * Legacy layouts, most-recent first, with the move each one needs. Ordered so a workspace
 * that is one step behind is told about that step, not about both at once.
 */
const LEGACY_SPEC_LAYOUTS: readonly (readonly [string, string])[] = [
  [
    'design/components/**/*.spec.ts',
    'Contracts are now `*.contract.ts`, because `*.spec.ts` is collected as a test file by vitest and jest. Rename them: `for f in design/components/*/*.spec.ts; do git mv "$f" "${f%.spec.ts}.contract.ts"; done`',
  ],
  [
    'components/*.contract.ts',
    "The input moved under design/, with each component's contract, tokens and extensions together: components/<name>.contract.ts becomes design/components/<name>/<name>.contract.ts. Or keep the old paths by setting components.specs in ds.config.ts.",
  ],
  [
    'components/*.spec.ts',
    'These need both renames: *.spec.ts became *.contract.ts, and the input moved under design/ — components/button.spec.ts becomes design/components/button/button.contract.ts.',
  ],
];

/**
 * Load the component contracts. They execute as TypeScript (via jiti) but must stay pure
 * data: the default export has to come from defineSpec() and must be JSON-serializable —
 * functions or class instances anywhere inside are rejected, because generation must be a
 * pure function of (tokens, contracts, config).
 */
export async function loadSpecs(config: ResolvedConfig): Promise<LoadSpecsResult> {
  const diagnostics: Diagnostic[] = [];
  const specs: LoadedSpec[] = [];
  const files = (await glob([config.components.specs], { cwd: config.root })).sort();

  // A clean break still has to be legible. Two renames landed in quick succession:
  // `*.spec.ts` became `*.contract.ts` (because `**/*.spec.ts` is in vitest's and jest's
  // default test-match, so contracts were collected as broken test suites), and the input
  // folders moved under `design/` with each component's files together. A workspace that has
  // done neither matches nothing, and the visible failure is GIRIH4034 blaming an extension
  // for a component that "does not exist" — or, with no extensions, a silently empty package.
  // Both send you looking in the wrong place.
  //
  // Only probed while the glob is still the default; a custom pattern is the author's.
  if (files.length === 0 && config.components.specs === DEFAULT_SPEC_GLOB) {
    for (const [legacyGlob, advice] of LEGACY_SPEC_LAYOUTS) {
      const found = (await glob([legacyGlob], { cwd: config.root })).sort();
      if (found.length === 0) continue;
      const plural = found.length === 1 ? '' : 's';
      diagnostics.push({
        code: 'GIRIH4023',
        severity: 'error',
        message: `No contracts matched '${config.components.specs}', but ${found.length} '${legacyGlob}' file${plural} ${found.length === 1 ? 'is' : 'are'} present (${found.slice(0, 3).join(', ')}${found.length > 3 ? ', …' : ''}).`,
        help: advice,
      });
      break;
    }
  }

  const jiti = createJiti(import.meta.url);
  const ejected = new Set(config.components.ejected);

  for (const file of files) {
    let exported: unknown;
    try {
      const mod = await jiti.import<{ default?: unknown }>(join(config.root, file));
      exported = (mod as { default?: unknown }).default ?? mod;
    } catch (error) {
      diagnostics.push({
        code: 'GIRIH4020',
        severity: 'error',
        message: `Failed to load spec: ${(error as Error).message}`,
        file,
        help: 'The spec is evaluated as real TypeScript, so a syntax error, an unresolved import, or a throw at module scope all land here.',
      });
      continue;
    }

    if (!isSpec(exported)) {
      diagnostics.push({
        code: 'GIRIH4021',
        severity: 'error',
        message: `${file} does not default-export a component spec.`,
        file,
        help: "Export the result of defineSpec({...}) from '@faravahar/girih'.",
      });
      continue;
    }

    const impure = findNonSerializable(exported);
    if (impure) {
      diagnostics.push({
        code: 'GIRIH4022',
        severity: 'error',
        message: `${file} contains a non-serializable value at '${impure}' — specs must be pure data.`,
        file,
        path: impure,
        help: 'Remove functions, dates, class instances, and symbols; a spec is a contract, not a program.',
      });
      continue;
    }

    if (ejected.has(exported.name)) continue;
    specs.push({ file, spec: exported });
  }

  return { specs, diagnostics };
}

function findNonSerializable(value: unknown, path = 'spec', ancestors = new WeakSet<object>()): string | null {
  if (value === null) return null;
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'undefined':
      return null;
    case 'object': {
      if (ancestors.has(value)) return path; // circular reference — not serializable
      ancestors.add(value);
      try {
        if (Array.isArray(value)) {
          for (const [i, item] of value.entries()) {
            const hit = findNonSerializable(item, `${path}[${i}]`, ancestors);
            if (hit) return hit;
          }
          return null;
        }
        if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
          return path; // class instance, Date, Map, …
        }
        for (const [key, child] of Object.entries(value)) {
          const hit = findNonSerializable(child, `${path}.${key}`, ancestors);
          if (hit) return hit;
        }
        return null;
      } finally {
        ancestors.delete(value);
      }
    }
    default:
      return path; // function, symbol, bigint
  }
}
