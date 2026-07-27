import { code, eli5, rule, gotcha, danger, aside, table, strap } from '../lib/ui.mjs';

export default function page(_data) {
  const sections = [
    { id: 'before', title: 'Before you start' },
    { id: 'notonnpm', title: 'A note on installing' },
    { id: 'clone', title: 'Path A: explore this repo' },
    { id: 'scratch', title: 'Path B: start your own workspace' },
    { id: 'firstrun', title: 'Your first generate' },
    { id: 'consume', title: 'Using the package in an app' },
    { id: 'commands', title: 'Every command' },
    { id: 'trouble', title: 'When it does not work' },
  ];

  const body = `
<div class="prose">
<p class="lede">
  Two paths. Path A explores the example workspace in this repository and takes about two minutes;
  it is the fastest way to see what girih produces. Path B scaffolds a workspace of your own. Do A
  first even if you want B.
</p>

<h2 id="before">Before you start</h2>

${table(
  ['You need', 'Version', 'Check with'],
  [
    ['Node.js', '20 or newer', '<code>node --version</code>'],
    ['pnpm', '11.8.0 (this repo pins it)', '<code>pnpm --version</code>'],
    ['git', 'any recent', '<code>git --version</code>'],
  ],
)}

<p>
  pnpm is pinned through the <code>packageManager</code> field, so if you have corepack enabled the
  right version is used automatically. If you do not have pnpm at all:
</p>

${code(
  `corepack enable          # ships with Node 22+, easiest route
# or:
npm install -g pnpm@11.8.0`,
  { kind: 'shell', lang: 'none' },
)}

${gotcha(
  'Why pnpm specifically',
  `<p>
    This is a workspace monorepo where the example app depends on the packages by
    <code>workspace:*</code>, and the end-to-end test packs real tarballs and installs them into a
    scratch consumer. npm and yarn can host workspaces too, but the lockfile here is pnpm's and the
    scripts assume its layout. Use pnpm for the repo; your own <em>consuming</em> app can use
    whatever it likes.
  </p>`,
)}

<h2 id="notonnpm">A note on installing</h2>

${danger(
  'Nothing is published to npm yet',
  `<p>
    Every package in this repository is at version <code>0.1.0</code> and has never been published.
    <code>npm install @faravahar/girih</code> will not work today, and neither will
    <code>npx create-girih</code>. Both are wired and tested — the end-to-end suite packs real
    tarballs and installs them into a fresh consumer — but the publish has not happened. Until it
    does, you build from source, which is what both paths below do.
  </p>`,
)}

<h2 id="clone">Path A: explore this repo</h2>

${code(
  `git clone <this-repo> girih
cd girih
pnpm install
pnpm build            # tsup builds every package into dist/`,
  { kind: 'shell', lang: 'none' },
)}

<p>
  <code>pnpm build</code> is required before anything else, because the CLI you are about to run is
  the compiled one in <code>packages/cli/dist/cli.js</code>. Now compile the example design system:
</p>

${code(
  `cd examples/acme-ds

pnpm check            # validate tokens + contracts, print the resolved token table
pnpm run demo:react   # generate the React package, then bundle the demo
open demo/react/index.html`,
  { kind: 'shell', lang: 'none' },
)}

<p>
  That last page is a variant matrix with a live brand toggle. Flip it and watch the corner radius
  change along with the colour — that is the three-tier cascade doing its job, and
  <a href="04-tokens.html">chapter 04</a> explains exactly why.
</p>

<p>
  There is also a no-framework demo, which is worth opening because it proves the mechanism needs
  no React at all:
</p>

${code(`open demo/index.html   # plain HTML + the generated tokens.css, no bundler`, { kind: 'shell', lang: 'none' })}

<h2 id="scratch">Path B: start your own workspace</h2>

<p>
  <code>create-girih</code> scaffolds a working workspace — tokens in three tiers, one Button
  contract, and a demo page that needs no build step. Run it from the built binary:
</p>

${code(
  `# from the root of this repo, after pnpm build
node packages/create-girih/dist/cli.js my-ds --workspace

cd my-ds
pnpm install
pnpm exec girih generate react
open demo/index.html`,
  { kind: 'shell', lang: 'none' },
)}

<p>
  The <code>--workspace</code> flag makes the new directory a pnpm workspace that links back to
  this repo's packages, which is what you want while nothing is on npm. Once published, the same
  thing becomes <code>npx create-girih my-ds</code> with no flag.
</p>

<p>
  If you would rather add girih to a directory that already exists, use <code>girih init</code>
  instead. It refuses to run if a config file is already present, and warns you if an ancestor
  directory is already a girih workspace:
</p>

${code(
  `cd existing-project
pnpm exec girih init --name @acme/design-system --brand main`,
  { kind: 'shell', lang: 'none' },
)}

${eli5(`
  <p>
    <code>create-girih</code> makes a new folder from nothing. <code>girih init</code> adds girih to
    a folder you are already standing in. Same result, different starting point.
  </p>
`)}

${strap()}

<h2 id="firstrun">Your first generate</h2>

<p>
  Here is what <code>girih generate react</code> actually prints. Every line is a file written, with
  its byte count — girih is deliberately loud about what it touched:
</p>

${code(
  `$ pnpm exec girih generate react

write  packages/design-system/styles/tokens.css (6721 bytes)
write  packages/design-system/styles/components.css (6402 bytes)
write  packages/design-system/src/Button.tsx (1187 bytes)
write  packages/design-system/src/index.ts (612 bytes)
write  packages/design-system/package.json (694 bytes)
write  .ds/ir/ (6 component IR files)

Preview: open demo/index.html · usage: packages/design-system/README.md`,
  {
    kind: 'shell',
    lang: 'none',
  },
)}

<p>Four things were produced, and it is worth knowing which is which:</p>

${table(
  ['Output', 'What it is', 'Committed?'],
  [
    ['<code>styles/tokens.css</code>', 'Every token as a CSS custom property, with a scoped block per brand', 'No — regenerable'],
    ['<code>styles/components.css</code>', 'Component structure only; every design value is a <code>var()</code>', 'No — regenerable'],
    ['<code>src/*.tsx</code>', 'Typed React components, one per contract', 'No — regenerable'],
    ['<code>.ds/ir/*.json</code>', 'Canonical contract form, target-neutral', '<b>Yes</b> — it is the reviewable contract'],
    ['<code>.ds/manifest.json</code>', 'SHA-256 per emitted file, for drift detection', '<b>Yes</b> — it is the safety net'],
  ],
)}

${rule(
  'Do not edit anything under packages/design-system/',
  `<p>
    It is a build artifact. girih records a hash of every file it writes, and the next
    <code>generate</code> will refuse to run if it finds a hand edit — naming the file and telling
    you to either undo the change or <code>girih eject</code> the component. That refusal is the
    feature. If you find yourself wanting to edit the output, the thing you actually want to change
    is a token or a contract.
  </p>`,
)}

<h2 id="consume">Using the package in an app</h2>

<p>
  The generated package is an ordinary npm package. In your application, import the two stylesheets
  once and the components wherever you need them:
</p>

${code(
  `import '@acme/design-system/styles/tokens.css';
import '@acme/design-system/styles/components.css';
import { Button, BrandProvider } from '@acme/design-system';

export function Checkout() {
  return (
    <BrandProvider brand="seller">
      <Button variant="primary" size="lg">Pay now</Button>
    </BrandProvider>
  );
}`,
  { path: 'your app', kind: 'authored', lang: 'tsx' },
)}

<p>
  <code>BrandProvider</code> renders a wrapper carrying <code>data-brand="seller"</code>. That is
  the entire runtime — everything else is CSS resolving in the browser. Nest providers and the inner
  one wins, at any depth, which is why the CSS emitter goes to the trouble of re-declaring the
  dependents closure in each brand's scope.
</p>

${aside(
  'The order of those two imports matters — here is why',
  `
  <p>
    <code>tokens.css</code> defines the custom properties; <code>components.css</code> consumes them.
    CSS custom properties do not care about declaration order the way normal properties do — a
    <code>var()</code> is resolved at use time, not at parse time — so in practice either order
    works. Import tokens first anyway: it matches the dependency direction, and it means a reader
    scanning your entry file sees values before use.
  </p>
  <p>
    What <em>does</em> matter is that both are imported exactly once, at the application root. The
    generated <code>package.json</code> marks CSS as having side effects
    (<code>"sideEffects": ["**/*.css"]</code>) so bundlers do not tree-shake the imports away.
  </p>
`,
)}

<h2 id="commands">Every command</h2>

${table(
  ['Command', 'What it does', 'Writes?'],
  [
    ['<code>girih init</code>', 'Scaffold a workspace in the current directory', 'Yes'],
    ['<code>girih brand create &lt;name&gt;</code>', 'Add a brand overlay and register it in <code>ds.config.ts</code>', 'Yes'],
    ['<code>girih check</code>', 'Validate tokens, brands, contracts, extensions; print the token table', 'No'],
    ['<code>girih generate css</code>', 'Emit <code>tokens.css</code> + <code>tokens.d.ts</code>', 'Yes'],
    ['<code>girih generate react</code>', 'Emit the whole React package plus canonical IR', 'Yes'],
    ['<code>girih generate react --check</code>', 'Verify the output on disk is current. The CI gate.', '<b>No</b>'],
    ['<code>girih eject &lt;Component&gt;</code>', 'Convert one generated component into a tracked fork', 'Yes'],
    ['<code>girih build</code>', 'Compile the generated package to publishable <code>dist/</code>', 'Yes'],
    ['<code>girih publish</code>', 'Derive the semver bump from the contract diff and publish', 'Dry run by default'],
    ['<code>girih update</code>', 'Report ejected forks that drifted from current templates', 'No'],
  ],
)}

${gotcha(
  'Two flags to be careful with',
  `<p>
    <code>girih generate --force</code> overwrites hand-edited output. That is precisely the work
    the drift gate exists to protect, so reach for <code>girih eject</code> first — it carries the
    hand edits into a tracked fork rather than discarding them.
  </p>
  <p>
    <code>girih publish --yes</code> is the only irreversible command here. Without
    <code>--yes</code> it stages the package, prints the version diff, runs
    <code>npm publish --dry-run</code>, and cleans up. Read that output before adding the flag.
  </p>`,
)}

<h2 id="trouble">When it does not work</h2>

${table(
  ['Symptom', 'Cause', 'Fix'],
  [
    [
      '<code>run `pnpm build` before the consumer e2e</code>',
      'The CLI in <code>dist/</code> does not exist yet',
      '<code>pnpm build</code> from the repo root',
    ],
    [
      '<code>girih: command not found</code>',
      'The binary is workspace-local, not global',
      'Use <code>pnpm exec girih …</code> from inside the workspace',
    ],
    [
      '<code>GIRIH1001</code> — no config found',
      'You are not in a girih workspace',
      '<code>cd</code> to the directory containing <code>ds.config.ts</code>',
    ],
    [
      '<code>GIRIH2006</code> — no token files matched',
      'Empty or misnamed <code>tokens/</code>',
      'Create <code>tokens/global.tokens.json</code>; the tier comes from the filename',
    ],
    [
      '<code>GIRIH1010</code> — file edited by hand',
      'Someone edited generated output',
      'Undo it, or <code>girih eject</code> the component to keep the edits',
    ],
    [
      'Brand switch changes colour but not radius',
      'A brand block is missing part of the dependents closure',
      'Regenerate. If it persists it is a generator bug — see <a href="06-the-code.html">chapter 06</a>',
    ],
    [
      '<code>ENOENT … e2e/.tmp/consumer/app/smoke.mjs</code>',
      'Known flake: two e2e files share <code>e2e/.tmp</code> and one deletes it in teardown',
      'Re-run. It passes in isolation with <code>pnpm vitest run e2e/test/consumer.test.ts</code>',
    ],
  ],
)}

<p>
  Every diagnostic girih can emit is listed in <a href="07-error-codes.html">chapter 07</a>,
  extracted directly from the source. If you got a code that is not there, the reference is stale —
  re-run <code>node docs/scripts/extract-diagnostics.mjs</code>.
</p>

<p>
  Something is on your screen now. <a href="03-how-it-works.html">Chapter 03</a> explains what
  happened when you pressed enter.
</p>
</div>`;

  return { sections, body, widgets: [] };
}
