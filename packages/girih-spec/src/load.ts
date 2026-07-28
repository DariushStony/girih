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

/**
 * Load components/*.contract.ts files. Specs execute as TypeScript (via jiti) but must
 * stay pure data: the default export has to come from defineSpec() and must be
 * JSON-serializable — functions or class instances anywhere inside are rejected,
 * because generation must be a pure function of (tokens, specs, config).
 */
export async function loadSpecs(config: ResolvedConfig): Promise<LoadSpecsResult> {
  const diagnostics: Diagnostic[] = [];
  const specs: LoadedSpec[] = [];
  const files = (await glob([config.components.specs], { cwd: config.root })).sort();

  // A clean break still has to be legible. Contracts moved from `*.spec.ts` to
  // `*.contract.ts` because `**/*.spec.ts` is in the default test-match of both vitest and
  // jest, so a consumer running plain `vitest run` collected every contract as a failing
  // test suite. Without this diagnostic the upgrade surfaces as an *empty catalog* instead:
  // GIRIH4034 blaming an extension for a component that "does not exist", or — with no
  // extensions — a silently empty generated package. Both send you looking in the wrong
  // place. Only probed when the glob still ends in `.contract.ts`; a custom pattern is the
  // author's business.
  if (files.length === 0 && config.components.specs.endsWith('.contract.ts')) {
    const legacyGlob = config.components.specs.replace(/\.contract\.ts$/, '.spec.ts');
    const legacy = (await glob([legacyGlob], { cwd: config.root })).sort();
    if (legacy.length > 0) {
      const plural = legacy.length === 1 ? '' : 's';
      diagnostics.push({
        code: 'GIRIH4023',
        severity: 'error',
        message: `No contracts matched '${config.components.specs}', but ${legacy.length} '${legacyGlob}' file${plural} ${legacy.length === 1 ? 'is' : 'are'} present (${legacy.slice(0, 3).join(', ')}${legacy.length > 3 ? ', …' : ''}).`,
        help: 'Contracts are now `*.contract.ts`, because `*.spec.ts` is collected as a test file by vitest and jest. Rename them: `for f in components/*.spec.ts; do git mv "$f" "${f%.spec.ts}.contract.ts"; done`',
      });
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
