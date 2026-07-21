import type { Diagnostic } from '@girih/core';
import { resolveReferences, usesReferences } from 'style-dictionary/utils';
import { toNestedDtcg } from './merge.js';
import type { RawTokenSet, ResolvedToken, ResolvedTokenGraph } from './types.js';

const REFERENCE_RE = /\{([^{}]+)\}/g;

/** Every {alias} reference inside a value — including embedded-in-string and composite values. */
export function findReferences(value: unknown): string[] {
  const refs: string[] = [];
  const visit = (v: unknown): void => {
    if (typeof v === 'string') {
      for (const match of v.matchAll(REFERENCE_RE)) refs.push(match[1]!.trim());
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    } else if (typeof v === 'object' && v !== null) {
      Object.values(v).forEach(visit);
    }
  };
  visit(value);
  return refs;
}

export interface ResolveResult {
  graph: ResolvedTokenGraph;
  diagnostics: Diagnostic[];
}

export function resolveTokenSet(brand: string, set: RawTokenSet): ResolveResult {
  const diagnostics: Diagnostic[] = [];
  const references = new Map<string, string[]>();

  for (const token of set.tokens.values()) {
    references.set(token.path, findReferences(token.value));
  }

  // Unknown references — tokens that point at nothing. Deduped so a value
  // containing '{missing}' twice reports once.
  const unresolvable = new Set<string>();
  for (const token of set.tokens.values()) {
    for (const ref of new Set(references.get(token.path)!)) {
      if (!set.tokens.has(ref)) {
        unresolvable.add(token.path);
        diagnostics.push({
          code: 'GIRIH2030',
          severity: 'error',
          message: `'${token.path}' references '{${ref}}', which does not exist.`,
          file: token.file,
          path: token.path,
          ...suggestion(ref, set),
        });
      }
    }
  }

  // Cycle detection: iterative DFS with colors; report each cycle once, with its full chain.
  const color = new Map<string, 'gray' | 'black'>();
  const inCycle = new Set<string>();
  for (const start of set.tokens.keys()) {
    if (color.get(start) === 'black') continue;
    const stack: Array<{ path: string; nextRef: number }> = [{ path: start, nextRef: 0 }];
    const chain: string[] = [start];
    color.set(start, 'gray');
    while (stack.length > 0) {
      const frame = stack.at(-1)!;
      const refs = references.get(frame.path)!.filter((r) => set.tokens.has(r));
      if (frame.nextRef >= refs.length) {
        color.set(frame.path, 'black');
        stack.pop();
        chain.pop();
        continue;
      }
      const next = refs[frame.nextRef++]!;
      if (color.get(next) === 'gray') {
        const cycle = [...chain.slice(chain.indexOf(next)), next];
        if (!cycle.some((p) => inCycle.has(p))) {
          const owner = set.tokens.get(next)!;
          diagnostics.push({
            code: 'GIRIH2031',
            severity: 'error',
            message: `Circular token reference: ${cycle.map((p) => `'${p}'`).join(' → ')}.`,
            file: owner.file,
            path: next,
            help: 'Break the cycle by pointing one of these tokens at a raw value.',
          });
        }
        cycle.forEach((p) => inCycle.add(p));
      } else if (color.get(next) !== 'black') {
        color.set(next, 'gray');
        stack.push({ path: next, nextRef: 0 });
        chain.push(next);
      }
    }
  }

  // Poison propagation: anything that can reach a broken token is itself unresolvable,
  // but only the root cause gets a diagnostic.
  const poisoned = new Set<string>([...unresolvable, ...inCycle]);
  const dependents = new Map<string, string[]>();
  for (const [path, refs] of references) {
    for (const ref of refs) {
      if (!dependents.has(ref)) dependents.set(ref, []);
      dependents.get(ref)!.push(path);
    }
  }
  const queue = [...poisoned];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const dependent of dependents.get(current) ?? []) {
      if (!poisoned.has(dependent)) {
        poisoned.add(dependent);
        queue.push(dependent);
      }
    }
  }

  // Value substitution — string leaves delegated to style-dictionary so alias
  // semantics match the ecosystem; composite values (shadow, typography, …)
  // are walked so references inside objects/arrays resolve too.
  const nested = toNestedDtcg(set);
  const resolveDeep = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return usesReferences(value)
        ? resolveReferences(value, nested as Parameters<typeof resolveReferences>[1], { usesDtcg: true })
        : value;
    }
    if (Array.isArray(value)) return value.map(resolveDeep);
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolveDeep(child)]));
    }
    return value;
  };

  const tokens = new Map<string, ResolvedToken>();
  for (const token of set.tokens.values()) {
    let resolvedValue: unknown;
    if (poisoned.has(token.path)) {
      resolvedValue = undefined;
    } else {
      try {
        resolvedValue = resolveDeep(token.value);
      } catch (error) {
        resolvedValue = undefined;
        diagnostics.push({
          code: 'GIRIH2032',
          severity: 'error',
          message: `Failed to resolve '${token.path}': ${(error as Error).message}`,
          file: token.file,
          path: token.path,
        });
      }
    }
    tokens.set(token.path, { ...token, resolvedValue, references: references.get(token.path)! });
  }

  return { graph: { brand, tokens }, diagnostics };
}

function suggestion(missing: string, set: RawTokenSet): { help?: string } {
  const lastSegment = missing.split('.').at(-1)!;
  const group = missing.split('.').slice(0, -1).join('.');
  const paths = [...set.tokens.keys()];
  const sameName = paths.filter((p) => p.endsWith(`.${lastSegment}`) || p === lastSegment);
  const siblings = group ? paths.filter((p) => p.startsWith(`${group}.`)) : [];
  const candidates = [...new Set([...sameName, ...siblings])].slice(0, 3);
  return candidates.length > 0 ? { help: `Did you mean ${candidates.map((c) => `'{${c}}'`).join(' or ')}?` } : {};
}
