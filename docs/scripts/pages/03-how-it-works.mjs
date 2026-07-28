import { code, eli5, rule, gotcha, aside, table, rail, pkgMap, strap } from '../lib/ui.mjs';
import { pipelineStepper } from '../lib/widgets.mjs';

export default function page(data) {
  const stepper = pipelineStepper({ id: 'w-stepper' });

  const sections = [
    { id: 'overview', title: 'The whole thing at once' },
    { id: 'stepper', title: 'Walk it stage by stage' },
    { id: 'twopaths', title: 'Two compile targets, one token build' },
    { id: 'diagnostics', title: 'How girih reports problems' },
    { id: 'gates', title: 'The four gates' },
    { id: 'provenance', title: 'Provenance: who wrote which file' },
  ];

  const body = `
<div class="prose">
<p class="lede">
  When you run <code>girih generate react</code>, six things happen in a fixed order. None of them
  is complicated on its own. The interesting part is the order, and the invariant each stage
  establishes for the next.
</p>

<h2 id="overview">The whole thing at once</h2>

${rail([
  { title: 'Read', detail: 'glob, parse, infer tier', owner: 'tokens' },
  { title: 'Merge', detail: 'flatten to one path map', owner: 'tokens' },
  { title: 'Overlay', detail: 'apply brand overrides', owner: 'tokens' },
  { title: 'Resolve', detail: 'follow aliases, find cycles', owner: 'tokens' },
  { title: 'Validate', detail: 'tier direction, brand parity', owner: 'tokens' },
  { title: 'Emit', detail: 'CSS, React, IR', owner: 'generators' },
])}

<p>
  Read that rail as a pipeline where each stage may only assume what earlier stages guaranteed.
  <em>Resolve</em> can follow an alias chain because <em>Merge</em> put every token in one
  addressable map. <em>Emit</em> can write a brand-scoped block because <em>Overlay</em> recorded
  which paths each brand touched. Getting the order wrong would not merely be inefficient — several
  of these stages are impossible earlier than they appear.
</p>

${eli5(`
  <p>
    It is a kitchen line. Someone reads the tickets, someone stacks the ingredients where they can be
    found, someone swaps in substitutions for the customer with allergies, someone actually cooks,
    someone checks the plate, and someone carries it out. Each station trusts the one before it. If
    the substitutions happened after cooking, you would be scraping cheese off a finished dish.
  </p>
`)}

<h2 id="stepper">Walk it stage by stage</h2>

<p>
  Below is the same pipeline, following one real token: <code>radius.md</code>, which lives in the
  global tier and which the <code>seller</code> brand overrides from <code>8px</code> to
  <code>2px</code>. It is the most instructive token in the example workspace, because a global
  override has to travel through two levels of alias to reach a button — so it exercises the entire
  three-tier design in one hop.
</p>

${stepper.html}

<p>
  Two details in that walkthrough deserve to be pulled out, because they are the difference between
  girih working and girih looking like it works.
</p>

${gotcha(
  'Poison propagation: one typo, one error',
  `<p>
    At the <em>Resolve</em> stage, a token pointing at something that does not exist is unresolvable
    — obviously. But so is everything that references it, transitively. A naive implementation
    reports all of them, so a single typo in <code>color.primary</code> produces forty errors and
    buries the cause.
  </p>
  <p>
    girih computes the poisoned set, marks every affected token as unresolved so nothing downstream
    emits a bogus value, and reports a diagnostic <em>only for the root cause</em>. You fix one
    thing and forty errors disappear. The same reasoning drives
    <code>dedupeAcrossBrands()</code>: a problem in the base token set is identical for every brand,
    so it is reported once rather than once per brand.
  </p>`,
)}

${rule(
  'The dependents closure — the single most important function in the emitter',
  `<p>
    At <em>Emit</em>, a brand block cannot contain only the tokens that brand overrode. CSS custom
    properties are computed <em>where they are declared</em>, so
    <code>--ds-button-radius: var(--ds-radius-control)</code> declared in <code>:root</code> resolves
    against <code>:root</code> and would ignore a nested brand scope entirely.
  </p>
  <p>
    So the emitter walks the reference graph backwards from each overridden path and re-declares
    every token that can reach it. In the example, the <code>seller</code> brand overrides three
    tokens and its CSS block contains twelve declarations. The nine extra ones are the closure, and
    without them a nested <code>BrandProvider</code> would silently render the wrong radius.
  </p>`,
)}

<h2 id="twopaths">Two compile targets, one token build</h2>

<p>
  <code>girih generate</code> takes a target: <code>css</code> or <code>react</code>. Both run the
  identical token pipeline; the React path adds contract loading on top.
</p>

${pkgMap([
  [
    { name: 'tokens/ + brands/', role: 'you write', layer: 'kernel' },
    '→',
    { name: 'buildTokenGraphs()', role: '@faravahar/girih-tokens', layer: 'pipeline' },
    '→',
    { name: 'generateCss()', role: '@faravahar/girih-generator-css', layer: 'generator' },
    '→',
    { name: 'tokens.css + tokens.d.ts', role: 'emitted', layer: 'surface' },
  ],
  [
    { name: 'components/*.contract.ts', role: 'you write', layer: 'kernel' },
    '→',
    { name: 'loadSpecs() → specToIR()', role: '@faravahar/girih-spec', layer: 'pipeline' },
    '→',
    { name: 'generateReact()', role: '@faravahar/girih-generator-react', layer: 'generator' },
    '→',
    { name: 'src/*.tsx + components.css', role: 'emitted', layer: 'surface' },
  ],
])}

<p>
  The contract path depends on the token path, not the other way round: <code>validateSpecs()</code>
  needs the resolved token graphs to check that every <code>{token.ref}</code> in a contract exists
  — and exists <em>in every brand</em>. That ordering is why a broken token set stops the build
  before contracts are even read. There is no point validating a contract against a graph you know
  is wrong.
</p>

${code(
  `// packages/girih/src/cli.ts — the one function generate, build and publish all route through
async function composeReact(config, build, cssFiles) {
  const { irs, extensions } = await loadComponentIRs(config, build);
  const ejected = await loadEjectedSources(config, build, irs);
  const { lock } = await readLock(config.root);
  const version = lock?.published?.version ?? '0.0.0-dev';
  const reactResult = generateReact(irs, { packageName: config.name, ... }, { extensions, ejected });
  return { files: [...cssFiles, ...reactResult.files], irFiles: ..., irs, extensions, ejected };
}`,
  { path: 'packages/girih/src/cli.ts', kind: 'authored' },
)}

${rule(
  'Why one function and not three',
  `<p>
    <code>generate</code>, <code>build</code> and <code>publish</code> must never disagree about what
    the package contains. If <code>publish</code> computed the file set slightly differently from
    <code>generate</code>, you could publish something nobody reviewed. Routing all three through
    <code>composeReact()</code> makes that class of bug unrepresentable. When you extend the output,
    extend this function — not the three call sites.
  </p>`,
)}

${strap()}

<h2 id="diagnostics">How girih reports problems</h2>

<p>
  girih almost never throws. Problems are values: a <code>Diagnostic</code> with a stable code, a
  severity, the file and token path it concerns, and — for anything actionable — a one-line
  <code>help</code>.
</p>

${code(
  `export interface Diagnostic {
  /** Stable machine-readable code, e.g. 'GIRIH2003'. */
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** Workspace-relative file the problem originates from, when known. */
  file?: string;
  /** Token or component path, e.g. 'button.primary.background'. */
  path?: string;
  /** One-line suggestion for fixing the problem. */
  help?: string;
}`,
  { path: 'packages/girih-core/src/diagnostics.ts', kind: 'authored' },
)}

<p>
  Diagnostics accumulate through the whole run rather than aborting at the first problem, so one
  <code>girih check</code> tells you everything that is wrong instead of making you play
  whack-a-mole. The codes are partitioned by owning package:
</p>

${table(
  ['Range', 'Owner', 'Covers', 'Count'],
  Object.entries(data.families ?? {}).map(([, f]) => [
    `<code>${f.range}</code>`,
    `<code>${f.owner}</code>`,
    f.topic,
    `<span class="num">${f.codes.length}</span>`,
  ]),
  { align: [null, null, null, 'num'] },
)}

<p>
  Some diagnostics do real work beyond reporting. <code>GIRIH2030</code> — an unknown token
  reference — runs a small similarity search over the token set and suggests the paths you probably
  meant:
</p>

${code(
  `error GIRIH2030: 'button.primary.background' references '{color.primaryy}', which does not exist.
  help: Did you mean '{color.primary}' or '{color.primary-hover}'?`,
  { kind: 'shell', lang: 'none' },
)}

<p>
  And <code>GIRIH2031</code> reports the <em>entire</em> cycle rather than just announcing that one
  exists, which is the difference between a five-second fix and a twenty-minute hunt through a
  three-tier alias graph:
</p>

${code(
  `error GIRIH2031: Circular token reference: 'radius.control' → 'button.radius' → 'radius.control'.
  help: Break the cycle by pointing one of these tokens at a raw value.`,
  { kind: 'shell', lang: 'none' },
)}

<h2 id="gates">The four gates</h2>

<p>
  girih refuses to proceed in four situations. Each refusal protects a different thing, and knowing
  which gate you hit tells you what to do.
</p>

${table(
  ['Gate', 'Refuses when', 'Protects', 'Override'],
  [
    [
      '<b>Broken token set</b>',
      'Any token diagnostic is an error',
      'You from emitting CSS built on unresolved values',
      'None — fix the tokens',
    ],
    [
      '<b>Invalid contract</b>',
      'A spec references a token some brand lacks, or declares an unimplementable state',
      'A component that cannot satisfy its contract under every brand',
      'None — fix the contract',
    ],
    [
      '<b>Drift</b>',
      '<code>.ds/manifest.json</code> hash ≠ the file on disk',
      "Someone's hand edits from being silently destroyed",
      '<code>--force</code>, or better: <code>girih eject</code>',
    ],
    [
      '<b>Stale output</b>',
      'On-disk output ≠ what the generator would produce now',
      'Publishing something that does not match its source',
      'None — run <code>generate</code>',
    ],
  ],
)}

${aside(
  'How drift detection actually works — it is simpler than it sounds',
  `
  <p>
    Every file girih emits goes through <code>emittedFile(path, contents)</code>, which computes a
    SHA-256 of the contents alongside the path. After a successful write, the manifest stores
    <code>path → hash</code> for everything written.
  </p>
  <p>
    On the next run, girih hashes what is on disk and compares. Three outcomes: the hash matches
    (fine, overwrite it); the file is absent (fine, write it); the hash differs (a human edited it —
    stop). That is the whole mechanism. No timestamps, no file watchers, no daemon.
  </p>
  <p>
    The <code>--check</code> variant uses the same primitive from the other direction:
    <code>verifyEmittedFiles()</code> compares the on-disk contents to freshly generated contents
    and lists the differences without writing anything. That is what makes it safe to run in CI.
  </p>
`,
)}

<h2 id="provenance">Provenance: who wrote which file</h2>

<p>
  In a girih workspace the single most useful question about any file is: did a human write this, or
  did girih? Here is the complete answer.
</p>

${table(
  ['Path', 'Author', 'In git?', 'Notes'],
  [
    ['<code>ds.config.ts</code>', 'You', 'Yes', '<code>girih brand create</code> also edits it, carefully'],
    ['<code>tokens/**</code>', 'You', 'Yes', 'Three tiers, tier inferred from filename'],
    ['<code>brands/*/tokens.json</code>', 'You', 'Yes', 'Overrides only — new paths are an error'],
    ['<code>components/*.contract.ts</code>', 'You', 'Yes', 'The contracts'],
    ['<code>extensions/*.ext.ts</code>', 'You', 'Yes', 'Constrained by <code>overridableTokens</code>'],
    ['<code>components/ejected/*.tsx</code>', 'You (after eject)', 'Yes', 'A tracked fork; CSS still generated'],
    ['<code>.ds/ir/*.json</code>', 'girih', '<b>Yes</b>', 'Canonical contract — review it in PRs'],
    ['<code>.ds/manifest.json</code>', 'girih', '<b>Yes</b>', 'The drift baseline; committing it is the point'],
    ['<code>ds.lock</code>', 'girih', '<b>Yes</b>', 'Ejections + last published version and signature'],
    ['<code>packages/design-system/**</code>', 'girih', 'No', 'Pure artifact; gitignored in this repo'],
    ['<code>.ds/cache/</code>, <code>.ds/publish/</code>', 'girih', 'No', 'Scratch space'],
  ],
)}

${gotcha(
  'The counter-intuitive one',
  `<p>
    <code>.ds/ir/</code> and <code>.ds/manifest.json</code> are generated <em>and</em> committed,
    which looks like a contradiction. It is not. The IR is the reviewable form of your contract — a
    diff of <code>.ds/ir/button.json</code> in a pull request shows exactly what changed about the
    Button's public surface, which the <code>.contract.ts</code> diff shows less directly. And the
    manifest has to be committed or drift detection cannot survive a fresh clone.
  </p>
  <p>
    The rule is not "generated files are not committed". It is "generated files are not
    <em>edited</em>". Those are different claims.
  </p>`,
)}

<p>
  You now know the shape of the pipeline. <a href="04-tokens.html">Chapter 04</a> goes deep on the
  first five stages, and it is where the multi-brand story actually gets told.
</p>
</div>`;

  return { sections, body, widgets: [stepper] };
}
