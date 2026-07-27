import { createHash } from 'node:crypto';
import type { EmittedFile } from '@faravahar/girih-core';
import type { ResolvedTokenGraph } from '@faravahar/girih-tokens';
import type { ComponentIR, LoadedExtension, StyleRuleIR } from '@faravahar/girih-spec';

/**
 * A structural fingerprint of everything a published package's public contract
 * depends on. Semver bumps are derived by diffing two of these — not from commit
 * messages or manual choice. This is the "semver from contract diffs" the plan
 * calls out as the differentiator.
 *
 * Two layers, deliberately:
 *  - the structured fields below *classify* a change (major / minor / patch,
 *    with human-readable reasons);
 *  - `outputDigest` is a *floor*: if the emitted artifacts changed at all, the
 *    version must move even when no structured rule fired. That makes
 *    "published output changed but the version didn't" impossible by
 *    construction, which is the invariant consumers actually depend on.
 */
export interface PublishSignature {
  /** brand → token path → resolved value (stringified). A value change is a patch. */
  tokens: Record<string, Record<string, string>>;
  components: Record<string, ComponentSignature>;
  extensions: Record<string, { extends: string; tokens: Record<string, string> }>;
  /** Component name → hash of its user-owned ejected source. */
  ejected?: Record<string, string>;
  /** sha256 over every emitted artifact except package.json (which carries the version). */
  outputDigest?: string;
}

export interface ComponentSignature {
  template: string;
  templateVersion: number;
  /** Host element — a change re-types refs and re-parents DOM, so it is breaking. */
  element: string;
  /** axis → { values (sorted), default } */
  variants: Record<string, { values: string[]; default: string }>;
  /** prop name → stringified default */
  props: Record<string, string>;
  states: string[];
  childrenRequired: boolean;
  role: string | null;
  /** state → sorted 'attr=value' pairs the template wires up. */
  aria: Record<string, string[]>;
  /**
   * The styling contract: 'scope|property' → token reference. Catches restyles
   * that keep every name and token value identical but change the CSS.
   */
  styles: Record<string, string>;
}

export type Bump = 'major' | 'minor' | 'patch' | 'none';

const stringifyValue = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value ?? null));

function collectStyles(ir: ComponentIR): Record<string, string> {
  const styles: Record<string, string> = {};
  const add = (scope: string, rules: StyleRuleIR[]) => {
    for (const rule of rules) styles[`${scope}|${rule.property}`] = rule.ref;
  };
  add('base', ir.tokens.base);
  for (const state of ir.tokens.baseStates) add(`state:${state.state}`, state.declarations);
  for (const block of ir.tokens.variants) {
    add(`${block.axis}.${block.value}`, block.declarations);
    for (const state of block.states) add(`${block.axis}.${block.value}:${state.state}`, state.declarations);
  }
  for (const part of ir.tokens.parts) add(`part:${part.part}`, part.declarations);
  return styles;
}

export interface SignatureInput {
  graphs: Map<string, ResolvedTokenGraph>;
  irs: ComponentIR[];
  extensions: LoadedExtension[];
  /** template name → current implementation version, from the generator registry. */
  templateVersions?: Record<string, number>;
  /** Ejected sources by component name — their content is part of what ships. */
  ejected?: Record<string, string>;
  /** Everything `girih generate react` emits; drives the output digest. */
  files?: EmittedFile[];
}

export function computeSignature(input: SignatureInput): PublishSignature {
  const { graphs, irs, extensions } = input;

  const tokens: PublishSignature['tokens'] = {};
  for (const [brand, graph] of graphs) {
    const brandTokens: Record<string, string> = {};
    for (const [path, token] of graph.tokens) brandTokens[path] = stringifyValue(token.resolvedValue);
    tokens[brand] = brandTokens;
  }

  const components: PublishSignature['components'] = {};
  for (const ir of irs) {
    components[ir.name] = {
      template: ir.template,
      templateVersion: input.templateVersions?.[ir.template] ?? 0,
      element: ir.element,
      variants: Object.fromEntries(ir.variants.map((axis) => [axis.axis, { values: [...axis.values].sort(), default: axis.default }])),
      props: Object.fromEntries(ir.props.map((p) => [p.name, String(p.default)])),
      states: [...ir.states].sort(),
      childrenRequired: ir.childrenRequired,
      role: ir.accessibility.role ?? null,
      aria: Object.fromEntries(
        ir.accessibility.aria.map((entry) => [
          entry.state,
          Object.entries(entry.attributes)
            .map(([attr, value]) => `${attr}=${value}`)
            .sort(),
        ]),
      ),
      styles: collectStyles(ir),
    };
  }

  const extensionSig: PublishSignature['extensions'] = {};
  for (const { extension } of extensions) {
    extensionSig[extension.name] = { extends: extension.extends, tokens: { ...extension.tokens } };
  }

  const signature: PublishSignature = { tokens, components, extensions: extensionSig };
  if (input.ejected && Object.keys(input.ejected).length > 0) {
    signature.ejected = Object.fromEntries(
      Object.entries(input.ejected)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, source]) => [name, createHash('sha256').update(source).digest('hex')]),
    );
  }
  if (input.files) signature.outputDigest = digestFiles(input.files);
  return signature;
}

/** Stable digest of emitted artifacts; package.json is excluded because it carries the version. */
export function digestFiles(files: EmittedFile[]): string {
  const hash = createHash('sha256');
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    if (file.path === 'package.json') continue;
    hash.update(`${file.path}:${file.hash}\n`);
  }
  return hash.digest('hex');
}

const higher = (a: Bump, b: Bump): Bump => {
  const rank: Record<Bump, number> = { none: 0, patch: 1, minor: 2, major: 3 };
  return rank[a] >= rank[b] ? a : b;
};

export interface SignatureDiff {
  bump: Bump;
  reasons: string[];
}

/**
 * Diff two signatures into a bump plus human reasons. Removals are breaking
 * (major); additions and template-version increases are features (minor);
 * value-only changes are patches. If the emitted output changed but no rule
 * fired, the bump floors to patch — silence is never an option when the
 * published bytes differ.
 */
export function diffSignatures(base: PublishSignature | null, next: PublishSignature): SignatureDiff {
  if (!base) return { bump: 'minor', reasons: ['first publish (no baseline recorded)'] };

  let bump: Bump = 'none';
  const reasons: string[] = [];
  const note = (b: Bump, reason: string) => {
    bump = higher(bump, b);
    reasons.push(`${b}: ${reason}`);
  };

  // Brands.
  for (const brand of Object.keys(base.tokens)) if (!next.tokens[brand]) note('major', `brand '${brand}' removed`);
  for (const brand of Object.keys(next.tokens)) if (!base.tokens[brand]) note('minor', `brand '${brand}' added`);

  // Token paths + values, per shared brand.
  for (const brand of Object.keys(next.tokens)) {
    const baseTokens = base.tokens[brand];
    if (!baseTokens) continue;
    const nextTokens = next.tokens[brand]!;
    for (const path of Object.keys(baseTokens)) if (!(path in nextTokens)) note('major', `token '${path}' removed from '${brand}'`);
    for (const path of Object.keys(nextTokens)) {
      if (!(path in baseTokens)) note('minor', `token '${path}' added to '${brand}'`);
      else if (baseTokens[path] !== nextTokens[path]) note('patch', `token '${path}' value changed in '${brand}'`);
    }
  }

  // Components.
  for (const name of Object.keys(base.components)) if (!next.components[name]) note('major', `component '${name}' removed`);
  for (const name of Object.keys(next.components)) {
    const baseComponent = base.components[name];
    const nextComponent = next.components[name]!;
    if (!baseComponent) {
      note('minor', `component '${name}' added`);
      continue;
    }
    diffComponent(name, baseComponent, nextComponent, note);
  }

  // Extensions.
  for (const name of Object.keys(base.extensions)) if (!next.extensions[name]) note('major', `extension '${name}' removed`);
  for (const name of Object.keys(next.extensions)) {
    const baseExt = base.extensions[name];
    const nextExt = next.extensions[name]!;
    if (!baseExt) {
      note('minor', `extension '${name}' added`);
      continue;
    }
    if (baseExt.extends !== nextExt.extends) note('major', `extension '${name}' now extends '${nextExt.extends}'`);
    diffMap(`extension '${name}'`, baseExt.tokens, nextExt.tokens, note, { added: 'minor', removed: 'major', changed: 'patch' });
  }

  // Ejected forks — user-owned source that ships in the package.
  const baseEjected = base.ejected ?? {};
  const nextEjected = next.ejected ?? {};
  for (const name of Object.keys(baseEjected)) if (!(name in nextEjected)) note('minor', `'${name}' returned to generated code`);
  for (const name of Object.keys(nextEjected)) {
    if (!(name in baseEjected)) note('minor', `'${name}' is now an ejected fork`);
    else if (baseEjected[name] !== nextEjected[name]) note('patch', `ejected '${name}' source changed`);
  }

  // Floor: emitted bytes differ, so something shipped — never publish nothing.
  if (bump === 'none' && base.outputDigest && next.outputDigest && base.outputDigest !== next.outputDigest) {
    note('patch', 'generated output changed (no contract rule matched)');
  }

  return { bump, reasons };
}

function diffComponent(
  name: string,
  base: ComponentSignature,
  next: ComponentSignature,
  note: (b: Bump, reason: string) => void,
): void {
  // Identity first: a different template is breaking regardless of version numbers.
  if (base.template !== next.template) {
    note('major', `'${name}' template changed (${base.template} → ${next.template})`);
  } else if (next.templateVersion > base.templateVersion) {
    note('minor', `'${name}' template ${next.template} v${base.templateVersion}→v${next.templateVersion}`);
  } else if (next.templateVersion < base.templateVersion) {
    note('major', `'${name}' template ${next.template} rolled back v${base.templateVersion}→v${next.templateVersion}`);
  }

  if (base.element !== next.element) note('major', `'${name}' host element changed (<${base.element}> → <${next.element}>)`);
  if (base.childrenRequired !== next.childrenRequired) {
    note(next.childrenRequired ? 'major' : 'minor', `'${name}' children ${next.childrenRequired ? 'now required' : 'no longer required'}`);
  }
  if (base.role !== next.role) note('major', `'${name}' role changed (${base.role ?? 'none'} → ${next.role ?? 'none'})`);

  diffList(`'${name}' states`, base.states, next.states, note);

  // Props: name set plus defaults.
  diffMap(`'${name}' prop`, base.props, next.props, note, { added: 'minor', removed: 'major', changed: 'minor' });

  // Variant axes: values plus which value is the default.
  for (const axis of Object.keys(base.variants)) if (!(axis in next.variants)) note('major', `'${name}' variant axis '${axis}' removed`);
  for (const axis of Object.keys(next.variants)) {
    const baseAxis = base.variants[axis];
    const nextAxis = next.variants[axis]!;
    if (!baseAxis) {
      note('minor', `'${name}' variant axis '${axis}' added`);
      continue;
    }
    diffList(`'${name}.${axis}'`, baseAxis.values, nextAxis.values, note);
    if (baseAxis.default !== nextAxis.default) note('minor', `'${name}.${axis}' default changed (${baseAxis.default} → ${nextAxis.default})`);
  }

  // Aria wiring and the styling contract.
  for (const state of new Set([...Object.keys(base.aria), ...Object.keys(next.aria)])) {
    const before = (base.aria[state] ?? []).join(',');
    const after = (next.aria[state] ?? []).join(',');
    if (before !== after) note('minor', `'${name}' aria for '${state}' changed`);
  }
  diffMap(`'${name}' style`, base.styles, next.styles, note, { added: 'patch', removed: 'patch', changed: 'patch' });
}

function diffMap(
  label: string,
  base: Record<string, string>,
  next: Record<string, string>,
  note: (b: Bump, reason: string) => void,
  bumps: { added: Bump; removed: Bump; changed: Bump },
): void {
  for (const key of Object.keys(base)) if (!(key in next)) note(bumps.removed, `${label} '${key}' removed`);
  for (const key of Object.keys(next)) {
    if (!(key in base)) note(bumps.added, `${label} '${key}' added`);
    else if (base[key] !== next[key]) note(bumps.changed, `${label} '${key}' changed`);
  }
}

function diffList(label: string, base: string[], next: string[], note: (b: Bump, reason: string) => void): void {
  for (const item of base) if (!next.includes(item)) note('major', `${label} '${item}' removed`);
  for (const item of next) if (!base.includes(item)) note('minor', `${label} '${item}' added`);
}

/** Apply a bump to a semver string. 0.x pre-1.0: a major bump moves the minor (npm convention). */
export function applyBump(version: string, bump: Bump): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(version);
  if (!match) return version;
  let [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const preOneStable = major === 0;
  switch (bump) {
    case 'major':
      if (preOneStable) minor += 1, (patch = 0);
      else major += 1, (minor = 0), (patch = 0);
      break;
    case 'minor':
      if (preOneStable) patch += 1;
      else minor += 1, (patch = 0);
      break;
    case 'patch':
      patch += 1;
      break;
    case 'none':
      break;
  }
  return `${major}.${minor}.${patch}`;
}
