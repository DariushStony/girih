import { code, eli5, rule, gotcha, aside, table, strap } from '../lib/ui.mjs';

export default function page(_data) {
  const sections = [
    { id: 'before', title: 'Before you start' },
    { id: 'scratch', title: 'Path A: start your own workspace' },
    { id: 'clone', title: 'Path B: explore this repo' },
    { id: 'firstrun', title: 'Your first generate' },
    { id: 'consume', title: 'Using the package in an app' },
    { id: 'commands', title: 'Every command' },
    { id: 'trouble', title: 'When it does not work' },
  ];

  const body = `
<div class="prose">
<p class="lede">
  Two paths. Path A scaffolds a workspace of your own from npm and takes about a minute. Path B
  clones this repository to read the example and the engine behind it. Path A is what you want
  unless you are here to change girih itself.
</p>

<h2 id="before">Before you start</h2>

${table(
  ['You need', 'Version', 'Check with'],
  [
    ['Node.js', '22.22.1 or newer', '<code>node --version</code>'],
    ['A package manager', 'npm, pnpm, yarn or bun', '<code>npm --version</code>'],
    ['git', 'any recent — Path B only', '<code>git --version</code>'],
  ],
)}

${gotcha(
  'Where the Node floor comes from',
  `<p>
    girih's token pipeline builds on <code>style-dictionary</code>, which requires Node 22, and its
    toolchain requires 22.22.1. Every girih package declares that same floor rather than promising
    something its own dependencies contradict. If you are below it, <code>girih doctor</code> says so
    in one line instead of letting a dependency fail obscurely later.
  </p>`,
)}

<h2 id="scratch">Path A: start your own workspace</h2>

<p>
  <code>create-girih</code> scaffolds a working workspace — tokens in three tiers, one Button
  contract, a brand overlay, and a demo page that needs no build step. Use whichever form matches
  your package manager; they all resolve to the same package:
</p>

${code(
  `npx create-girih my-ds
pnpm create girih my-ds
npm create girih my-ds
yarn create girih my-ds`,
  { kind: 'shell', lang: 'none' },
)}

<p>
  It creates the directory, writes <code>package.json</code>, installs the toolchain, then hands off
  to <code>girih init</code> — so the workspace template lives in the CLI and the two can never
  drift apart. Then:
</p>

${code(
  `cd my-ds

girih check            # resolved token table + contract validation
girih generate react   # compile the design system package
open demo/index.html   # every variant, size and brand`,
  { kind: 'shell', lang: 'none' },
)}

<p>
  If you would rather install the CLI once and reuse it, <code>girih create</code> does the same job
  without a second download:
</p>

${code(
  `npm install -g @faravahar/girih
girih create my-ds`,
  { kind: 'shell', lang: 'none' },
)}

<p>
  And to add girih to a project that already has a <code>package.json</code>, use
  <code>girih init</code>. It refuses to run if a config file is already present, and warns you if
  an ancestor directory is already a girih workspace:
</p>

${code(
  `cd existing-project
npm install -D @faravahar/girih
npx girih init --name @acme/design-system --brand main`,
  { kind: 'shell', lang: 'none' },
)}

${eli5(`
  <p>
    Three doors into the same room. <code>npx create-girih</code> needs nothing installed and makes a
    new folder. <code>girih create</code> also makes a new folder, but expects you already have the
    CLI. <code>girih init</code> adds girih to the folder you are already standing in, and is the
    only one that does not write a <code>package.json</code> — because you already have one.
  </p>
`)}

${gotcha(
  'girih init does not install anything for you',
  `<p>
    The other two run your package manager; <code>init</code> only writes files. So after it, install
    the pieces the generated components import — the runtime, react, and react's types:
  </p>
  <p><code>npm install -D @faravahar/girih-react-runtime react @types/react</code></p>
  <p>
    If you skip that, <code>girih build</code> stops with a single <code>GIRIH6002</code> naming
    exactly what is missing rather than a wall of TypeScript errors about files you never wrote.
  </p>`,
)}

<h2 id="clone">Path B: explore this repo</h2>

<p>
  For reading the engine, or changing it. This is also the path to the fully worked example — six
  contracts, two brands, an extension and an ejected fork — which the scaffold deliberately does not
  include.
</p>

${code(
  `git clone https://github.com/DariushStony/girih.git
cd girih
corepack enable       # pnpm 11.17.0 is pinned via packageManager
pnpm install
pnpm build            # tsup + tsc build every package into dist/`,
  { kind: 'shell', lang: 'none' },
)}

${gotcha(
  'Why pnpm for the repo specifically',
  `<p>
    This is a workspace monorepo where the example depends on the packages by
    <code>workspace:*</code>, and the end-to-end suite packs real tarballs and installs them into
    scratch consumers. npm and yarn can host workspaces too, but the lockfile here is pnpm's, the
    scripts assume its layout, and only pnpm's packer rewrites <code>workspace:*</code> into a real
    version range at publish time. Use pnpm for the repo; your own workspace from Path A can use
    whatever you like.
  </p>`,
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

${aside(
  'Working on girih itself, from a workspace outside the repo',
  `
  <p>
    <code>create-girih --workspace</code> links the girih packages through the pnpm workspace
    protocol instead of published ranges, so a scaffolded workspace inside this monorepo tracks your
    local changes rather than npm:
  </p>
  <p><code>node packages/create-girih/dist/cli.js my-ds --workspace</code></p>
  <p>
    Only useful inside the repo, and only after <code>pnpm build</code> — which is why it is here
    rather than in Path A.
  </p>
`,
)}

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
    ['<code>girih create &lt;dir&gt;</code>', 'Create a new workspace in a new directory, install, initialise', 'Yes'],
    ['<code>girih init</code>', 'Scaffold into the current directory (which already has a <code>package.json</code>)', 'Yes'],
    ['<code>girih brand create &lt;name&gt;</code>', 'Add a brand overlay and register it in <code>ds.config.ts</code>', 'Yes'],
    ['<code>girih check</code>', 'Validate tokens, brands, contracts, extensions; print the token table', 'No'],
    ['<code>girih doctor</code>', 'Diagnose the <em>environment</em>: node, package manager, resolution, prerequisites', 'No'],
    ['<code>girih generate css</code>', 'Emit <code>tokens.css</code> + <code>tokens.d.ts</code>', 'Yes'],
    ['<code>girih generate react</code>', 'Emit the whole React package plus canonical IR', 'Yes'],
    ['<code>girih generate react --check</code>', 'Verify the output on disk is current. The CI gate.', '<b>No</b>'],
    ['<code>girih eject &lt;Component&gt;</code>', 'Convert one generated component into a tracked fork', 'Yes'],
    ['<code>girih forks</code>', 'Report ejected forks that drifted from current templates', 'No'],
    ['<code>girih build</code>', 'Compile the generated package to publishable <code>dist/</code>', 'Yes'],
    ['<code>girih publish</code>', 'Derive the semver bump from the contract diff and publish', 'Dry run by default'],
    ['<code>girih update</code>', 'Upgrade the <code>@faravahar/girih-*</code> packages in this workspace', 'Yes'],
    ['<code>girih --version</code>', 'Print the installed version', 'No'],
  ],
)}

${rule(
  'check and doctor answer different questions',
  `<p>
    <code>girih check</code> validates what your workspace <em>contains</em> — do the tokens resolve,
    do the contracts reference tokens that exist in every brand, has generated output been edited by
    hand. <code>girih doctor</code> validates the environment it runs <em>in</em> — node version,
    package manager, whether the CLI resolves, whether the build prerequisites are installed, whether
    the girih packages are at matching versions.
  </p>
  <p>
    Between them they answer "it worked on my machine". Reach for <code>doctor</code> when something
    fails before girih has said anything useful, and <code>check</code> when girih is running but
    disagrees with you.
  </p>`,
)}

${gotcha(
  'girih publish does not publish girih',
  `<p>
    It publishes <em>your</em> generated design system — it stages
    <code>packages/design-system</code>, computes the version from the contract diff, and hands that
    to npm. girih's own packages are released from its repository by its maintainers.
  </p>
  <p>
    <code>girih update</code> is the mirror of that: it upgrades the girih tooling installed in your
    workspace. It has nothing to do with <code>girih forks</code>, which reports ejected components
    that have drifted from their template.
  </p>`,
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

<p>
  Start with <code>girih doctor</code>. It checks the things that go wrong before girih has had a
  chance to say anything useful, and prints a fix for each:
</p>

${code(
  `$ girih doctor

✔ node                 v24.11.0 (>=22.22.1 required)
✔ package manager      pnpm (/path/to/pnpm-lock.yaml)
✔ @faravahar/girih     resolves from /path/to/my-ds
✔ ds.config.ts         @acme/design-system · 2 brands · default 'marketplace'
✗ build prerequisites  react missing — \`girih build\` will not compile
                       fix: npm install -D react

✖ 1 problem will stop girih working here.`,
  { kind: 'shell', lang: 'none' },
)}

${table(
  ['Symptom', 'Cause', 'Fix'],
  [
    [
      '<code>girih: command not found</code>',
      'Installed locally, not globally',
      'Use <code>npx girih …</code> inside the workspace, or <code>npm i -g @faravahar/girih</code>',
    ],
    [
      '<code>GIRIH1002</code> — cannot load <code>ds.config.ts</code>',
      'It imports <code>@faravahar/girih</code>, which is not installed <em>here</em>',
      '<code>npm install -D @faravahar/girih</code> — a global install is not enough for the config',
    ],
    [
      '<code>GIRIH6002</code> — imports not installed',
      'The generated components need react and the runtime; <code>girih init</code> installs nothing',
      '<code>npm i -D @faravahar/girih-react-runtime react @types/react</code>',
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
      '<code>girih build</code> fails on a plain pnpm install',
      'Stale girih: the CLI used to depend on esbuild, whose postinstall pnpm 10+ blocks',
      '<code>girih update</code>. Current versions have no install scripts at all',
    ],
    [
      'Path B: <code>packages/cli/dist/cli.js</code> missing',
      'The repo runs its own compiled CLI',
      '<code>pnpm build</code> from the repo root',
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
