#!/usr/bin/env node
/**
 * Extract the REAL resolved token graphs for examples/acme-ds into docs/data/tokens.json.
 *
 * This does not re-implement resolution — it calls girih's own @faravahar/girih-core + @faravahar/girih-tokens
 * against the example workspace, so every value the documentation shows is the value girih
 * actually produces. If the pipeline changes, this output changes with it.
 *
 * Requires `pnpm build` first (it imports the built dist).
 *
 * Usage:  node docs/scripts/extract-tokens.mjs
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const acme = join(repoRoot, 'examples/acme-ds');
const outPath = join(repoRoot, 'docs/data/tokens.json');

const coreDist = join(repoRoot, 'packages/core/dist/index.js');
const tokensDist = join(repoRoot, 'packages/tokens/dist/index.js');
for (const dist of [coreDist, tokensDist]) {
  if (!existsSync(dist)) {
    console.error(`Missing ${relative(repoRoot, dist)} — run \`pnpm build\` first.`);
    process.exit(1);
  }
}

const { loadConfig } = await import(pathToFileURL(coreDist).href);
const { buildTokenGraphs } = await import(pathToFileURL(tokensDist).href);

const { config, diagnostics: configDiagnostics } = await loadConfig(acme);
if (!config) {
  console.error('loadConfig failed:', configDiagnostics);
  process.exit(1);
}

const build = await buildTokenGraphs(config);

/** Serialize one resolved graph: path → { tier, type, value, resolvedValue, references, file }. */
function serializeGraph(graph) {
  const tokens = {};
  for (const [path, token] of graph.tokens) {
    tokens[path] = {
      tier: token.tier,
      type: token.type ?? null,
      // `value` is the authored form (may contain {alias}); resolvedValue is the final value.
      value: token.value,
      resolvedValue: token.resolvedValue ?? null,
      references: token.references ?? [],
      file: token.file,
      description: token.description ?? null,
    };
  }
  return tokens;
}

const brands = [...build.graphs.keys()];
const graphs = {};
for (const [brand, graph] of build.graphs) graphs[brand] = serializeGraph(graph);

/** Tier counts, for the docs to quote without recounting. */
const tiers = { global: 0, semantic: 0, component: 0 };
for (const token of build.base.tokens.values()) tiers[token.tier] += 1;

/**
 * Alias chains worth teaching, resolved per brand. Each chain is the hop list from a
 * component-tier token down to a raw value — the thing the token walker animates.
 */
function chainFor(brand, startPath) {
  const tokens = graphs[brand];
  const hops = [];
  let current = startPath;
  const seen = new Set();
  while (current && tokens[current] && !seen.has(current)) {
    seen.add(current);
    const token = tokens[current];
    const refs = token.references ?? [];
    hops.push({
      path: current,
      tier: token.tier,
      authored: typeof token.value === 'string' ? token.value : JSON.stringify(token.value),
      resolved: token.resolvedValue,
      overriddenHere: (build.overrides.get(brand) ?? []).includes(current),
    });
    current = refs.length === 1 ? refs[0] : null;
  }
  return hops;
}

const TEACHING_CHAINS = ['button.radius', 'button.primary.background', 'input.border-focus', 'badge.primary.background'];
const chains = {};
for (const brand of brands) {
  chains[brand] = {};
  for (const start of TEACHING_CHAINS) chains[brand][start] = chainFor(brand, start);
}

/** The authored source files, verbatim, so the docs can show what a human actually wrote. */
function readIfPresent(rel) {
  const full = join(acme, rel);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

const sources = {
  'ds.config.ts': readIfPresent('ds.config.ts'),
  'tokens/global.tokens.json': readIfPresent('tokens/global.tokens.json'),
  'tokens/semantic.tokens.json': readIfPresent('tokens/semantic.tokens.json'),
  'tokens/components/button.tokens.json': readIfPresent('tokens/components/button.tokens.json'),
  'brands/marketplace/tokens.json': readIfPresent('brands/marketplace/tokens.json'),
  'brands/seller/tokens.json': readIfPresent('brands/seller/tokens.json'),
  'components/button.spec.ts': readIfPresent('components/button.spec.ts'),
  'components/badge.spec.ts': readIfPresent('components/badge.spec.ts'),
  'extensions/payment-button.ext.ts': readIfPresent('extensions/payment-button.ext.ts'),
};

/** The generated artifacts, verbatim — what girih emitted from the sources above. */
const generated = {
  'styles/tokens.css': readIfPresent('packages/design-system/styles/tokens.css'),
  'styles/components.css': readIfPresent('packages/design-system/styles/components.css'),
  'src/Button.tsx': readIfPresent('packages/design-system/src/Button.tsx'),
  'src/Badge.tsx': readIfPresent('packages/design-system/src/Badge.tsx'),
  'src/PaymentButton.tsx': readIfPresent('packages/design-system/src/PaymentButton.tsx'),
  'src/index.ts': readIfPresent('packages/design-system/src/index.ts'),
  'package.json': readIfPresent('packages/design-system/package.json'),
  '.ds/ir/Button.json': readIfPresent('.ds/ir/Button.json'),
  '.ds/manifest.json': readIfPresent('.ds/manifest.json'),
};

/**
 * The generated artifacts live under the example's packages directory, which is
 * gitignored — so on a fresh clone they do not exist until `girih generate react` has run
 * in the example workspace. Emitting nulls here would silently gut the live brand-switch
 * widget, so fail loudly instead and say exactly what to run.
 */
const missing = Object.entries(generated)
  .filter(([, contents]) => contents === null)
  .map(([name]) => name);
if (missing.length > 0) {
  console.error('Missing generated artifacts — the docs need girih\'s real output:');
  for (const name of missing) console.error(`  examples/acme-ds/packages/design-system/${name}`);
  console.error('\nRun this first:');
  console.error('  cd examples/acme-ds && pnpm exec girih generate react');
  process.exit(1);
}

const payload = {
  generatedBy: 'docs/scripts/extract-tokens.mjs',
  note: 'Do not edit by hand. Produced by running girih\'s own token engine over examples/acme-ds.',
  workspace: { name: config.name, root: 'examples/acme-ds', prefix: config.tokens.prefix },
  brands: {
    all: brands,
    default: config.brands.default,
    overrides: Object.fromEntries([...build.overrides].map(([brand, paths]) => [brand, paths])),
  },
  counts: { tokens: build.base.tokens.size, tiers, brands: brands.length },
  diagnostics: build.diagnostics.map((d) => ({ code: d.code, severity: d.severity, message: d.message })),
  chains,
  graphs,
  sources,
  generated,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

console.log(`Wrote ${relative(repoRoot, outPath)}`);
console.log(`  ${build.base.tokens.size} tokens (${tiers.global} global, ${tiers.semantic} semantic, ${tiers.component} component)`);
console.log(`  ${brands.length} brands: ${brands.map((b) => `${b}(${build.overrides.get(b)?.length ?? 0} overrides)`).join(', ')}`);
console.log(`  ${build.diagnostics.length} diagnostics from the example workspace`);
for (const brand of brands) {
  const chain = chains[brand]['button.radius'];
  console.log(`  chain button.radius @${brand}: ${chain.map((h) => h.path).join(' → ')} = ${chain.at(-1)?.resolved}`);
}
