import { code, eli5, rule, gotcha, cards, table, tierStack, strap } from '../lib/ui.mjs';

export default function page(data) {
  const t = data.counts;

  const sections = [
    { id: 'what', title: 'What girih is' },
    { id: 'shape', title: 'The shape of a workspace' },
    { id: 'oneparagraph', title: 'How it works, in one paragraph' },
    { id: 'who', title: 'Is this for you?' },
    { id: 'promises', title: 'The four promises' },
    { id: 'map', title: 'Where to go next' },
  ];

  const body = `
<div class="prose">
<p class="lede">
  girih compiles a design system. You describe your design language once — colours, spacing,
  type, and the components that use them — and girih turns that description into a real,
  versioned npm package that your applications install. When the description changes, you
  recompile. You never hand-edit the result.
</p>

<h2 id="what">What girih is</h2>

<p>
  The word most people reach for is "component library". That is not what this is. A component
  library hands you finished buttons. girih hands you a <em>compiler</em>: you write the
  specification, it produces the buttons — along with the CSS, the TypeScript types, the
  accessibility wiring, and a version number derived from what actually changed.
</p>

<p>
  The distinction matters because of what it makes possible. If components are <em>generated</em>
  from a description rather than written by hand, then one description can produce a whole family
  of design systems that differ only in their values. That is the problem girih exists to solve:
  several brands, one component set, no forks.
</p>

${eli5(`
  <p>
    Think of a rubber stamp. A component library sells you a stamp that prints one shape in one
    colour. girih sells you the <em>stamp-cutting machine</em>: you describe the shape, and it cuts
    a stamp. Want the same shape in a different colour for a different brand? You do not cut a new
    stamp — you change the ink. The shape is shared; only the values differ.
  </p>
`)}

<h2 id="shape">The shape of a workspace</h2>

<p>
  A girih workspace has three inputs and one output. Everything on the left is written by a human
  and committed to git. Everything on the right is produced by a command and is never edited.
</p>

${code(
  `my-design-system/
├── ds.config.ts             ← which brands exist, what the package is called
├── tokens/                  ← the design language: colour, space, type, radius
│   ├── global.tokens.json         raw values         (${t.tiers.global} tokens in the example)
│   ├── semantic.tokens.json       named meanings     (${t.tiers.semantic} tokens)
│   └── components/*.json          per-component      (${t.tiers.component} tokens)
├── brands/                  ← one folder per brand, values only
│   ├── marketplace/tokens.json
│   └── seller/tokens.json
├── components/              ← one contract per component
│   └── button.contract.ts
│
└── packages/design-system/   ← GENERATED. Do not touch.
    ├── src/*.tsx                  typed React components
    ├── styles/tokens.css          every brand's values as CSS custom properties
    ├── styles/components.css      structure only — every value is a var()
    └── dist/                      compiled ESM + .d.ts, ready to publish`,
  {
    path: 'a girih workspace',
    lang: 'none',
  },
)}

${rule(
  'The one rule that explains all the others',
  `<p>
    Source of truth on the left, build artifact on the right, and the arrow only ever points one
    way. Every other rule in girih — the override-only rule for brands, drift detection, tracked
    ejection, contract-derived versioning — exists to keep that arrow pointing one way even as
    real teams push against it.
  </p>`,
)}

<h2 id="oneparagraph">How it works, in one paragraph</h2>

<p>
  girih reads your token files and flattens them into one big map from dotted path to value. It
  applies each brand's overlay on top of that map — overrides only, never additions. It follows
  every <code>{alias}</code> reference down to a raw value, reporting unknown references and
  circular ones by name. It checks that references only ever point downward through the tiers, and
  that every brand ended up with the same set of paths. Then it emits CSS, where the aliases
  survive as live <code>var()</code> references so that switching a <code>data-brand</code>
  attribute re-resolves the whole chain in the browser with no rebuild. Separately, it reads your
  component contracts, cross-validates every token reference against <em>every</em> brand's
  resolved graph, and compiles each contract into a readable React component plus structure-only
  CSS. A manifest of content hashes lets it refuse to overwrite anything a human edited.
</p>

<p>
  If that paragraph raised more questions than it answered, that is the correct reaction — and
  <a href="03-how-it-works.html">chapter 03</a> walks through it one stage at a time with real
  data. If it read as obvious, you can probably skip to <a href="06-the-code.html">the code</a>.
</p>

${strap()}

<h2 id="who">Is this for you?</h2>

<p>girih is a good fit if you recognise your situation here:</p>

<ul>
  <li>
    <strong>You ship more than one brand.</strong> Two storefronts, a white-label product, a
    marketplace plus a seller console. They should feel like siblings, not clones, and definitely
    not forks.
  </li>
  <li>
    <strong>Your design tokens already exist but nothing enforces them.</strong> You have a
    <code>colors.ts</code> somewhere, and also nineteen hardcoded hex values that snuck past review.
  </li>
  <li>
    <strong>You want generated code you can actually read.</strong> girih's output is meant to be
    reviewed in a pull request like any other code — no runtime style engine, no opaque bundle.
  </li>
</ul>

<p>It is a poor fit if:</p>

<ul>
  <li>
    <strong>You have one brand and twelve components.</strong> The governance machinery costs more
    than it saves. Write the components by hand.
  </li>
  <li>
    <strong>You need a component library today.</strong> girih generates from <em>your</em>
    contracts; it does not ship a catalog you can adopt. The example workspace has six components
    to demonstrate the mechanism, not to be your design system.
  </li>
  <li>
    <strong>Your designers need to change production values without a pull request.</strong>
    Everything here flows through git on purpose.
  </li>
</ul>

${gotcha(
  'Current status, honestly',
  `<p>
    Milestones M1–M6 work: tokens, multi-brand CSS, contracts, React generation, the workspace
    commands, the component catalog, packaging and publishing. Eight packages are on npm under the
    <code>@faravahar</code> scope, plus <code>create-girih</code>; the version is <code>0.1.x</code>
    and the API may still move.
  </p>
  <p>
    What is <em>not</em> done: the Figma target is a stub, and <code>girih forks</code> reports drift
    in ejected forks but does not yet perform the three-way merge that would rebase them. Where a
    page below describes something unfinished, it says so.
  </p>`,
)}

<h2 id="promises">The four promises</h2>

<p>
  Everything girih does is in service of four guarantees. They are worth reading now and
  re-reading after chapter 04, when you will understand why each one is hard.
</p>

${table(
  ['Promise', 'What enforces it', 'What happens when it is violated'],
  [
    [
      '<b>One component set serves every brand</b>',
      'The override-only rule: a brand overlay may only replace paths that already exist',
      'A brand that adds a token gets a hard error, not a silent fork',
    ],
    [
      '<b>Rebranding needs no rebuild</b>',
      'Aliases are emitted as live <code>var()</code>, plus the dependents closure per brand scope',
      'A flattened literal would freeze the value; the build fails loudly instead',
    ],
    [
      '<b>Generated files are never silently lost</b>',
      '<code>.ds/manifest.json</code> stores a SHA-256 per emitted file',
      '<code>girih generate</code> refuses to run and names the edited files',
    ],
    [
      '<b>The version number means something</b>',
      'The semver bump is computed from a diff of the contract, not chosen by a human',
      'Removing a variant is a major bump whether or not anyone remembered',
    ],
  ],
)}

<h2 id="map">Where to go next</h2>

<p>
  These pages are written to be read in order, but each one stands alone. If you are in a hurry,
  read 02 then 04; that is the shortest path to being useful.
</p>

${cards([
  {
    n: '01',
    title: 'The idea',
    href: '01-the-idea.html',
    detail: 'Why design systems drift, and what a 12th-century tiling pattern has to do with it.',
  },
  {
    n: '02',
    title: 'Installation',
    href: '02-installation.html',
    detail: 'From empty folder to a rebrandable button in about five minutes.',
  },
  {
    n: '03',
    title: 'How it works',
    href: '03-how-it-works.html',
    detail: 'The compile pipeline, stage by stage, with real values moving through it.',
  },
  {
    n: '04',
    title: 'Tokens and brands',
    href: '04-tokens.html',
    detail: 'Three tiers, alias chains, and the rule that makes one stylesheet serve everyone.',
  },
  {
    n: '05',
    title: 'Contracts',
    href: '05-contracts.html',
    detail: 'How data becomes a typed, accessible component you can read and review.',
  },
  {
    n: '06',
    title: 'The code',
    href: '06-the-code.html',
    detail: 'All nine packages: what each owns and where to look when something breaks.',
  },
  {
    n: '07',
    title: 'Error codes',
    href: '07-error-codes.html',
    detail: `All ${data.diagCount ?? 70} GIRIH diagnostics, extracted from source, explained.`,
  },
  { n: '08', title: 'Check yourself', href: '08-quiz.html', detail: 'Ten questions that are hard to fake your way through.' },
])}

${tierStack([
  {
    tier: 'component',
    name: 'Component',
    sub: 'per-component decisions',
    chips: [{ text: 'button.radius' }, { text: 'button.primary.background' }, { text: 'input.border-focus' }],
  },
  {
    tier: 'semantic',
    name: 'Semantic',
    sub: 'named meanings',
    chips: [{ text: 'radius.control' }, { text: 'color.primary' }, { text: 'typography.size-md' }],
  },
  {
    tier: 'global',
    name: 'Global',
    sub: 'raw values',
    chips: [{ text: 'radius.md = 8px' }, { text: 'color.blue.600 = #2563EB' }],
  },
])}

<p style="font-family:var(--util);font-size:var(--t-sm);color:var(--text-muted)">
  That three-tier diagram recurs on every page. Learning to read it is most of learning girih:
  values live at the bottom, meanings in the middle, decisions at the top, and references only
  ever point downward.
</p>
</div>`;

  return { sections, body, widgets: [] };
}
