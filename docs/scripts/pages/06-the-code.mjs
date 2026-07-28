import { code, eli5, rule, gotcha, aside, table, pkgMap, strap } from '../lib/ui.mjs';
import { packageGraph } from '../lib/viz.mjs';

export default function page(_data) {
  const pkggraph = packageGraph({ id: 'w-pkggraph' });

  const sections = [
    { id: 'direction', title: 'The dependency direction' },
    { id: 'core', title: '@faravahar/girih-core — the shared kernel' },
    { id: 'tokens', title: '@faravahar/girih-tokens — the pipeline' },
    { id: 'generator-css', title: '@faravahar/girih-generator-css' },
    { id: 'spec', title: '@faravahar/girih-spec' },
    { id: 'generator-react', title: '@faravahar/girih-generator-react' },
    { id: 'cli', title: '@faravahar/girih' },
    { id: 'runtime', title: '@faravahar/girih-react-runtime' },
    { id: 'rest', title: 'create-girih and @faravahar/girih-figma' },
    { id: 'debug', title: 'Where to look when something breaks' },
    { id: 'tests', title: 'The test layout' },
  ];

  const body = `
<div class="prose">
<p class="lede">
  Nine packages. Their arrangement is not incidental — the dependency direction is the architecture,
  and most bad ideas in this codebase announce themselves as a need to import upward.
</p>

<h2 id="direction">The dependency direction</h2>

${pkgMap([
  [{ name: '@faravahar/girih-core', role: 'kernel — depends on nothing', layer: 'kernel' }],
  ['↑ depended on by ↑'],
  [
    { name: '@faravahar/girih-tokens', role: 'token pipeline', layer: 'pipeline' },
    '+',
    { name: '@faravahar/girih-core', role: '', layer: 'kernel' },
  ],
  ['↑'],
  [
    { name: '@faravahar/girih-generator-css', role: 'tokens → CSS', layer: 'generator' },
    '·',
    { name: '@faravahar/girih-spec', role: 'contracts', layer: 'pipeline' },
  ],
  ['↑'],
  [{ name: '@faravahar/girih-generator-react', role: 'IR → React (core + spec)', layer: 'generator' }],
  ['↑'],
  [{ name: '@faravahar/girih', role: 'the only package allowed to depend on all of them', layer: 'surface' }],
  ['standalone:'],
  [
    { name: '@faravahar/girih-react-runtime', role: 'react is a peer dep', layer: 'surface' },
    { name: 'create-girih', role: 'zero workspace deps', layer: 'surface' },
    { name: '@faravahar/girih-figma', role: 'phase-2 stub', layer: 'surface' },
  ],
])}

${pkggraph.html}

${rule(
  'If a fix seems to need an upward import, it belongs somewhere else',
  `<p>
    Every time this rule feels inconvenient, the logic wants to move down rather than the dependency
    move up. Something both <code>tokens</code> and <code>spec</code> need goes in
    <code>core</code>. Something <code>tokens</code> needs from <code>spec</code> is almost certainly
    a sign the responsibility is on the wrong side of the line.
  </p>
  <p>
    Nothing enforces this mechanically — no lint rule, no dependency-cruiser config. It is a review
    responsibility, which is why it is stated in <code>CLAUDE.md</code> and here.
  </p>`,
)}

${eli5(`
  <p>
    Picture a pyramid. <code>core</code> is the bottom block and holds nothing up but itself.
    Each layer may rest on the ones below it and never on the ones above. The CLI sits on top, which
    is why it can see everything — and why nothing may depend on the CLI.
  </p>
`)}

<h2 id="core">@faravahar/girih-core — the shared kernel</h2>

<p>
  Small on purpose. Four files, and every one exists so that other packages cannot disagree with
  each other.
</p>

${table(
  ['File', 'Exports', 'Why it is here and not elsewhere'],
  [
    [
      '<code>config.ts</code>',
      '<code>loadConfig</code>, <code>defineConfig</code>, <code>ResolvedConfig</code>, <code>CONFIG_FILENAMES</code>',
      'Everything needs the workspace shape; jiti loads the TS config at runtime',
    ],
    [
      '<code>diagnostics.ts</code>',
      '<code>Diagnostic</code>, <code>DiagnosticBag</code>, <code>formatDiagnostic</code>',
      "One reporting vocabulary, so the CLI can render any package's problems identically",
    ],
    [
      '<code>files.ts</code>',
      '<code>emittedFile</code>, <code>writeEmittedFiles</code>, <code>verifyEmittedFiles</code>',
      'One hashing and writing path — drift detection and publish diffing both depend on the hash being computed the same way everywhere',
    ],
    [
      '<code>naming.ts</code>',
      '<code>cssVarName</code>',
      'Emitted <code>tokens.css</code>, <code>tokens.d.ts</code> and <code>components.css</code> must agree on variable names or the output silently breaks',
    ],
  ],
)}

${code(
  `export function emittedFile(path: string, contents: string): EmittedFile {
  return { path, contents, hash: createHash('sha256').update(contents).digest('hex') };
}

/** Paths whose on-disk contents differ from the given files — the CI staleness gate. */
export async function verifyEmittedFiles(root: string, files: EmittedFile[]): Promise<string[]> {
  const stale: string[] = [];
  for (const file of files) {
    const onDisk = await readFile(join(root, file.path), 'utf8').catch(() => null);
    if (onDisk !== file.contents) stale.push(file.path);
  }
  return stale;
}`,
  { path: 'packages/girih-core/src/files.ts', kind: 'authored' },
)}

<p>
  Twelve lines carrying four features: drift detection, the <code>--check</code> CI gate, orphan
  cleanup, and bake-time staleness refusal. Worth reading before you write anything that emits a
  file.
</p>

<h2 id="tokens">@faravahar/girih-tokens — the pipeline</h2>

${table(
  ['File', 'Owns', 'Start here when'],
  [
    [
      '<code>engine.ts</code>',
      '<code>buildTokenGraphs()</code> — orchestrates everything; <code>inferTier()</code>',
      'You want the overall flow, or tier inference is wrong',
    ],
    ['<code>parse.ts</code>', 'DTCG reading, <code>$type</code> inheritance', 'A token file is misread or a type is not inherited'],
    [
      '<code>merge.ts</code>',
      '<code>mergeTokenFiles()</code>, <code>applyBrandOverlay()</code>, <code>toNestedDtcg()</code>',
      'An overlay does the wrong thing, or the override-only rule misfires',
    ],
    [
      '<code>resolve.ts</code>',
      '<code>resolveTokenSet()</code> — aliases, cycles, poison propagation',
      'A value resolves wrongly, or a cycle report is confusing',
    ],
    [
      '<code>validate.ts</code>',
      '<code>validateTierDirection()</code>, <code>validateBrandParity()</code>',
      'A tier or parity error looks wrong',
    ],
  ],
)}

<p>
  <code>resolve.ts</code> is the densest file in the repository and the one most worth reading in
  full. Three algorithms share it, and the ordering between them is load-bearing:
</p>

<ol>
  <li>
    <strong>Unknown-reference detection</strong>, deduped so a value containing
    <code>{missing}</code> twice reports once, with a "did you mean" search over the real token set.
  </li>
  <li>
    <strong>Cycle detection</strong> — an iterative depth-first search with grey/black colouring,
    reporting each cycle once with its <em>full</em> chain. Iterative rather than recursive so a
    pathological alias graph cannot blow the stack.
  </li>
  <li>
    <strong>Poison propagation</strong> — a reverse-graph walk marking everything that can reach a
    broken token as unresolvable, while reporting only the root cause.
  </li>
</ol>

${gotcha(
  'Why substitution is delegated to style-dictionary',
  `<p>
    girih finds and validates references itself but hands the final string substitution to
    <code>style-dictionary</code>'s <code>resolveReferences</code>. That is deliberate: alias
    semantics for edge cases — a reference embedded mid-string, composite values, DTCG's
    <code>usesDtcg</code> mode — should match what the rest of the token ecosystem does, rather than
    being girih's private interpretation. Composite values (shadow, typography) are walked manually so
    references <em>inside</em> objects and arrays resolve too.
  </p>`,
)}

<h2 id="generator-css">@faravahar/girih-generator-css</h2>

<p>Three files, and one function inside them matters more than the rest.</p>

${code(
  `/** The given paths plus every token that (transitively) references one of them. */
function dependentsClosure(roots: string[], graph: ResolvedTokenGraph): Set<string> {
  const closure = new Set(roots);
  if (closure.size === 0) return closure;

  const dependents = new Map<string, string[]>();
  for (const token of graph.tokens.values()) {
    for (const ref of token.references) {
      if (!dependents.has(ref)) dependents.set(ref, []);
      dependents.get(ref)!.push(token.path);
    }
  }

  const queue = [...closure];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const dependent of dependents.get(current) ?? []) {
      if (!closure.has(dependent)) { closure.add(dependent); queue.push(dependent); }
    }
  }
  return closure;
}`,
  { path: 'packages/girih-generator-css/src/generate.ts', kind: 'authored' },
)}

<p>
  Build the reverse reference graph, then breadth-first from the overridden paths. That set is what
  each brand block must re-declare, and <a href="04-tokens.html#closure">chapter 04</a> explains why
  omitting it produces a partial, plausible-looking failure.
</p>

<p>Two guards in the same file are worth knowing because they turn silent breakage into build errors:</p>

<ul>
  <li>
    <code>detectVarNameCollisions()</code> — two token paths mapping to one CSS variable name is a
    silent last-one-wins in CSS. <code>GIRIH3003</code>, hard error.
  </li>
  <li>
    <code>detectUnserializableValues()</code> — scans the emitted CSS for
    <code>[object Object]</code>, which is what a composite value looks like when no transform could
    flatten it. <code>GIRIH3002</code>.
  </li>
</ul>

<p>
  The package also emits <code>tokens.d.ts</code>: a <code>TokenPath</code> string-literal union of
  every real token path. That is what makes token references in contracts type-checked rather than
  merely string-shaped.
</p>

<h2 id="spec">@faravahar/girih-spec</h2>

${table(
  ['File', 'Owns'],
  [
    ['<code>define.ts</code>', '<code>defineSpec()</code>, <code>isSpec()</code>, the <code>SPEC_BRAND</code> marker'],
    ['<code>types.ts</code>', 'The contract shape — the most useful file to read first'],
    ['<code>ir.ts</code>', '<code>specToIR()</code> — canonicalisation'],
    ['<code>load.ts</code>', '<code>loadSpecs()</code>, <code>loadComponentIRs()</code> — jiti-based TS import'],
    ['<code>validate.ts</code>', '<code>validateSpecs()</code>, <code>validateExtensions()</code> — 31 diagnostics'],
    ['<code>extensions.ts</code>', '<code>defineVariant()</code>, <code>loadExtensions()</code>, <code>componentNamespace()</code>'],
  ],
)}

<p>
  <code>SPEC_BRAND</code> and <code>EXTENSION_BRAND</code> are runtime markers stamped by
  <code>defineSpec</code>/<code>defineVariant</code>. They exist because contracts are loaded from
  arbitrary user TypeScript, and girih needs to distinguish "a contract" from "some object someone
  default-exported" without trusting the type system across a runtime boundary.
</p>

<h2 id="generator-react">@faravahar/girih-generator-react</h2>

${table(
  ['File', 'Owns'],
  [
    ['<code>generate.ts</code>', '<code>generateReact()</code>, <code>renderComponentSource()</code>, the package + index emission'],
    ['<code>css.ts</code>', '<code>renderComponentCss()</code>, <code>renderExtensionCss()</code>, state selectors, element-class tables'],
    ['<code>templates/registry.ts</code>', '<code>TEMPLATE_REGISTRY</code> — capabilities and versions per template'],
    ['<code>templates/element.ts</code>', 'The general single-element template (Button, Badge, Card, Input)'],
    ['<code>templates/checkbox.ts</code>', 'Styled native input — a real element with a real indicator'],
    ['<code>templates/dialog.ts</code>', 'Base UI behind an adapter — focus trap, scroll lock, ARIA'],
  ],
)}

<p>
  <code>TEMPLATE_REGISTRY</code> is consulted from two places that are easy to miss:
  contract validation, so an unimplementable state is a build error rather than a missing CSS rule;
  and ejection, which records the template version so <code>girih forks</code> can report a fork
  whose template has since moved.
</p>

<h2 id="cli">@faravahar/girih</h2>

${table(
  ['File', 'Owns'],
  [
    ['<code>cli.ts</code>', 'Every command, plus <code>composeReact()</code> — the single source of truth for what gets written'],
    ['<code>build.ts</code>', '<code>buildPackage()</code>, <code>addJsExtensions()</code>, <code>emitDeclarations()</code>'],
    ['<code>manifest.ts</code>', '<code>detectDrift()</code>, <code>planManifestUpdate()</code>, read/write manifest'],
    ['<code>lock.ts</code>', '<code>readLock()</code>, <code>writeLock()</code> — ejections and the published baseline'],
    ['<code>semver.ts</code>', '<code>computeSignature()</code>, <code>diffSignatures()</code>, <code>applyBump()</code>'],
    ['<code>scaffold.ts</code>', '<code>scaffoldWorkspace()</code> — shared by <code>init</code> and <code>create-girih</code>'],
    ['<code>output.ts</code>', '<code>printDiagnostics()</code>, <code>table()</code> — terminal rendering'],
  ],
)}

${gotcha(
  'addJsExtensions() looks like a hack and is not',
  `<p>
    TypeScript emits <code>import { Button } from './Button'</code> with no file extension. Under
    Node's ESM resolution that is a runtime error, and which consumer setups break depends on their
    <code>moduleResolution</code> setting — so it fails for some users and not others, which is the
    worst kind of packaging bug.
  </p>
  <p>
    <code>addJsExtensions()</code> rewrites relative specifiers to include <code>.js</code> in the
    built output, which is why the packed tarball resolves correctly under every consumer
    configuration. <code>e2e/test/consumer.test.ts</code> is what proves it: it packs a real tarball,
    installs it into a scratch consumer, and server-renders every component.
  </p>`,
)}

<h2 id="runtime">@faravahar/girih-react-runtime</h2>

<p>
  One file, three exports, and <code>react</code> is a <em>peer</em> dependency — never a real one,
  or a consumer could end up with two Reacts.
</p>

${table(
  ['Export', 'What it does'],
  [
    ['<code>BrandProvider</code>', 'Renders a wrapper carrying <code>data-brand</code>, and publishes the brand on a context'],
    ['<code>useBrand</code>', 'Reads the current brand — for the rare case where JS needs to know'],
    ['<code>cx</code>', 'Class-name join. Deliberately tiny: no <code>clsx</code> dependency in generated output'],
  ],
)}

<p>
  That is the entire runtime cost of girih's theming. Everything else is CSS resolving in the
  browser.
</p>

<h2 id="rest">create-girih and @faravahar/girih-figma</h2>

<p>
  <code>create-girih</code> has <strong>zero workspace dependencies</strong>, which is a constraint
  rather than an oversight: it has to run via <code>npx</code> before anything is installed, so it
  cannot import <code>@faravahar/girih</code>. It detects the package manager from the environment and
  shells out.
</p>

<p>
  <code>@faravahar/girih-figma</code> is a private phase-2 stub. It consumes <code>ComponentIR</code>, which is
  the reason the IR exists as a target-neutral form at all. Do not grow it without being asked.
</p>

${strap()}

<h2 id="debug">Where to look when something breaks</h2>

${table(
  ['Symptom', 'Look at', 'Then'],
  [
    [
      'A token resolves to the wrong value',
      '<code>tokens/src/resolve.ts</code>',
      '<code>girih check --brand X</code> to see the resolved table',
    ],
    [
      'A brand override does not apply',
      '<code>tokens/src/merge.ts</code>',
      'Check <code>applyBrandOverlay()</code> recorded the path in <code>overriddenPaths</code>',
    ],
    [
      'Colour rebrands but radius does not',
      '<code>generator-css/src/generate.ts</code>',
      '<code>dependentsClosure()</code> — a missing closure member',
    ],
    ['A CSS variable has the wrong name', '<code>core/src/naming.ts</code>', 'Every emitter must route through <code>cssVarName()</code>'],
    ['A contract error seems wrong', '<code>spec/src/validate.ts</code>', 'The tests enumerate intended failures with their codes'],
    ['Emitted TSX is malformed', '<code>generator-react/src/templates/</code>', 'Find the template for that <code>element</code>'],
    [
      'A state has no CSS',
      '<code>generator-react/src/css.ts</code>',
      '<code>STATE_SELECTORS</code>, and whether the template claims the capability',
    ],
    ['<code>generate</code> refuses to run', '<code>cli/src/manifest.ts</code>', '<code>detectDrift()</code> — something was hand-edited'],
    [
      'The wrong version is proposed',
      '<code>cli/src/semver.ts</code>',
      '<code>diffSignatures()</code> reasons; compare to <code>ds.lock</code>',
    ],
    ['The package fails to import downstream', '<code>cli/src/build.ts</code>', '<code>addJsExtensions()</code>, then the consumer e2e'],
  ],
)}

<h2 id="tests">The test layout</h2>

<p>
  One root <code>vitest.config.ts</code>, no per-package config. It aliases five packages to their
  source so unit tests run without a build:
</p>

${code(
  `resolve: {
  // Tests run against source so packages don't need a build first.
  alias: {
    '@faravahar/girih-core': r('packages/girih-core/src/index.ts'),
    '@faravahar/girih-tokens': r('packages/girih-tokens/src/index.ts'),
    '@faravahar/girih-generator-css': r('packages/girih-generator-css/src/index.ts'),
    '@faravahar/girih-generator-react': r('packages/girih-generator-react/src/index.ts'),
    '@faravahar/girih-spec': r('packages/girih-spec/src/index.ts'),
  },
},
test: { include: ['packages/*/test/**/*.test.ts', 'e2e/test/**/*.test.ts'] },`,
  {
    path: 'vitest.config.ts',
    kind: 'authored',
  },
)}

${gotcha(
  'Two packages are deliberately NOT aliased',
  `<p>
    <code>@faravahar/girih</code> and <code>@faravahar/girih-react-runtime</code> are absent from that list. Anything
    exercising them runs against <code>dist/</code>, so <code>pnpm build</code> is required first.
    That is intentional for the CLI: the end-to-end tests should exercise the same compiled binary a
    user would run, not a source alias that might behave differently.
  </p>`,
)}

${aside(
  'A known flake in the e2e suite — and its cause',
  `
  <p>
    <code>e2e/test/consumer.test.ts</code> intermittently fails with
    <code>ENOENT … e2e/.tmp/consumer/app/smoke.mjs</code>. It passes when run alone.
  </p>
  <p>
    The cause: <code>workspace.test.ts</code> removes the whole of <code>e2e/.tmp</code> in its
    <code>afterAll</code>, while <code>consumer.test.ts</code> keeps its scratch directory under
    <code>e2e/.tmp/consumer</code>. Vitest runs the two files in parallel, so one file's teardown can
    delete a live sibling's working directory.
  </p>
  <p>
    The fix, for whoever wants it, is to scope that teardown to <code>e2e/.tmp/e2e-ds</code> and
    <code>e2e/.tmp/bad-brand</code> rather than the shared parent. It is recorded here so nobody
    spends an afternoon debugging their own change.
  </p>
`,
)}

<p>
  Verification, smallest scope first: <code>pnpm vitest run packages/&lt;pkg&gt;</code>, then
  <code>pnpm typecheck</code>, then the example workspace's <code>girih check</code>, and only run
  the consumer e2e when packaging changed.
</p>

<p>
  <a href="07-error-codes.html">Chapter 07</a> is the diagnostic reference — generated from these
  files, so it cannot drift.
</p>
</div>`;

  return { sections, body, widgets: [pkggraph] };
}
