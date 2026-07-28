import { code, eli5, rule, gotcha, danger, table, rail, strap } from '../lib/ui.mjs';

export default function page(data) {
  const sections = [
    { id: 'what', title: 'What a contract is' },
    { id: 'anatomy', title: 'Anatomy of a contract' },
    { id: 'pipeline', title: 'Contract to component' },
    { id: 'ir', title: 'The IR: why an intermediate form' },
    { id: 'output', title: 'What comes out' },
    { id: 'validation', title: 'Cross-validation against every brand' },
    { id: 'extensions', title: 'Extensions' },
    { id: 'templates', title: 'Templates and the Dialog problem' },
    { id: 'eject', title: 'Ejection: the tracked fork' },
    { id: 'semver', title: 'Versioning from the contract diff' },
  ];

  const body = `
<div class="prose">
<p class="lede">
  A contract describes a component: its variants, its states, which tokens it uses, how it behaves
  for assistive technology, and how far a consumer may extend it. You write it in TypeScript for the
  autocomplete. girih treats it as data.
</p>

<h2 id="what">What a contract is</h2>

<p>
  <code>defineSpec()</code> looks like a function call and is really a declaration. It does not run
  logic, branch on anything, or produce a component at runtime — it returns a plain object that
  girih validates, converts to a canonical form, diffs against the last published version, and
  compiles.
</p>

${rule(
  'Contracts are data, not code',
  `<p>
    TypeScript is the authoring surface because it gives you autocomplete on token paths — the
    generated <code>tokens.d.ts</code> exports a <code>TokenPath</code> union of every real token, so
    a typo is a type error before it is a build error. But the contract must remain pure data: no
    function values, no imports of runtime code, no environment branching. Everything girih can do
    with contracts — validate, diff, version, compile to multiple targets — depends on being able to
    read them without executing them.
  </p>`,
)}

${eli5(`
  <p>
    A contract is a specification, like a blueprint. It says "a Button has three variants, three
    sizes, uses these tokens, and is focusable". It does not <em>make</em> a button any more than a
    blueprint makes a house. girih is the builder, and the blueprint is what lets it check its work.
  </p>
`)}

<h2 id="anatomy">Anatomy of a contract</h2>

<p>Here is the real Button contract from the example workspace, in full:</p>

${code(data.sources['components/button.contract.ts'] ?? '', {
  path: 'components/button.contract.ts',
  kind: 'authored',
})}

<p>Field by field:</p>

${table(
  ['Field', 'What it declares', 'Consequence in the output'],
  [
    ['<code>name</code>', 'PascalCase component name', 'The exported identifier and the CSS class (<code>.ds-button</code>)'],
    ['<code>element</code>', 'The underlying DOM element', 'Which template is chosen, and what props are inherited'],
    ['<code>variants</code>', 'Named axes with values and a default', 'A TypeScript union per axis plus a <code>data-*</code> attribute'],
    [
      '<code>states</code>',
      'Interaction states to express',
      'CSS selectors — <code>:hover</code>, <code>:focus-visible</code>, <code>[data-loading]</code>',
    ],
    ['<code>slots</code>', 'Content holes and whether they are required', '<code>children</code> typing'],
    ['<code>tokens</code>', 'Which token drives which CSS property', 'Every declaration in <code>components.css</code>'],
    ['<code>accessibility</code>', 'Focusability and state→ARIA mapping', '<code>aria-busy</code>, <code>aria-disabled</code>, focus ring'],
    [
      '<code>extensibility</code>',
      'Whether it may be extended, and which tokens',
      'What <code>defineVariant</code> is allowed to override',
    ],
  ],
)}

${gotcha(
  'Nested states inside variants',
  `<p>
    Look at the <code>primary</code> variant: it has its own <code>states</code> block with a
    <code>hover</code> entry. That is how "the primary button gets darker on hover, but the secondary
    one does not" is expressed. It compiles to
    <code>.ds-button[data-variant="primary"]:hover</code> — a variant-scoped state selector — rather
    than a blanket hover rule. The secondary variant has no hover entry, so no such rule is emitted
    for it.
  </p>`,
)}

<h2 id="pipeline">Contract to component</h2>

${rail([
  { title: 'Load', detail: 'jiti imports the .contract.ts', owner: 'spec' },
  { title: 'To IR', detail: 'specToIR() canonicalises', owner: 'spec' },
  { title: 'Validate', detail: 'against every brand graph', owner: 'spec' },
  { title: 'Template', detail: 'pick by element + capability', owner: 'generator-react' },
  { title: 'Emit TSX', detail: 'typed, a11y-wired component', owner: 'generator-react' },
  { title: 'Emit CSS', detail: 'structure only, all var()', owner: 'generator-react' },
])}

<p>
  <code>jiti</code> is what lets girih import a TypeScript file at runtime without a build step —
  which is necessary because your contract is <code>.ts</code> and girih is running as a compiled
  binary that has never seen your source.
</p>

<h2 id="ir">The IR: why an intermediate form</h2>

<p>
  Between the contract and the generator sits <code>ComponentIR</code> — a canonical, target-neutral
  form written to <code>.ds/ir/&lt;Name&gt;.json</code>. It is generated, and it is
  <em>committed</em>, which surprises people.
</p>

${code(
  `{
  "name": "Button",
  "template": "element",
  "element": "button",
  "variants": [
    { "axis": "variant", "values": ["primary", "secondary", "danger"], "default": "primary" },
    { "axis": "size", "values": ["sm", "md", "lg"], "default": "md" }
  ],
  "states": ["hover", "focus-visible", "disabled", "loading"],
  "childrenRequired": true,
  "tokens": {
    "base": [
      { "property": "font-family",    "ref": "{typography.body-family}" },
      { "property": "border-radius",  "ref": "{button.radius}" }
    ],
    "variants": [
      { "axis": "variant", "value": "primary",
        "declarations": [
          { "property": "background", "ref": "{button.primary.background}" },
          { "property": "color",      "ref": "{button.primary.foreground}" }
        ],
        "states": [
          { "state": "hover",
            "declarations": [{ "property": "background", "ref": "{button.primary.background-hover}" }] }
        ] }
    ]
  },
  "accessibility": { "focusable": true, "aria": [{ "state": "loading", "attributes": { "aria-busy": "true" } }] },
  "extensibility": { "allowExtends": true, "overridableTokens": ["background", "color", "borderColor"] },
  "sourceFile": "components/button.contract.ts"
}`,
  { path: '.ds/ir/button.json (excerpt of the real file)', kind: 'generated', lang: 'json' },
)}

<p>The IR exists for three reasons, and they are all about decoupling:</p>

<ol>
  <li>
    <strong>Multiple targets, one shape.</strong> A future Figma generator should consume one
    canonical form rather than re-reading and re-interpreting <code>.contract.ts</code> files. The React
    generator already only sees IR — it has no idea TypeScript was involved.
  </li>
  <li>
    <strong>Reviewable diffs.</strong> Reorganising your spec file without changing its meaning
    produces no IR diff. Changing the component's public surface always does. In a pull request the
    IR diff is the honest answer to "what changed for consumers?"
  </li>
  <li>
    <strong>Diffable for versioning.</strong> The semver machinery compares signatures computed from
    IR. Canonical form means a formatting change cannot masquerade as a version bump.
  </li>
</ol>

${gotcha(
  'The IR directory is fully derived — so girih deletes it before writing',
  `<p>
    On each <code>generate react</code>, girih removes <code>.ds/ir/</code> entirely and rewrites it.
    If it merged instead, renaming a component would leave the old JSON behind forever, and the
    signature diff would think a component still exists that does not. Wholesale replacement is the
    only correct move for a directory that is purely a function of its inputs.
  </p>`,
)}

<h2 id="output">What comes out</h2>

<p>
  Two files per component. First the React component — this is the real emitted output, not a
  simplification:
</p>

${code(data.generated['src/button.tsx'] ?? '', {
  path: 'packages/design-system/src/button.tsx',
  kind: 'generated',
  lang: 'tsx',
})}

<p>Read what the contract bought you:</p>

<ul>
  <li>
    <code>ButtonVariant</code> and <code>ButtonSize</code> are string-literal unions — passing
    <code>"tertiary"</code> is a type error at the call site.
  </li>
  <li>
    <code>Omit&lt;ComponentPropsWithoutRef&lt;'button'&gt;, 'variant' | 'size'&gt;</code> means every
    native button prop works, with the two the contract claims removed so they cannot conflict.
  </li>
  <li>
    <code>data-variant</code> and <code>data-size</code> are the styling hooks — no class-name
    concatenation, no CSS-in-JS.
  </li>
  <li>
    <code>aria-busy</code> when loading, and <code>disabled || loading</code> so a loading button
    cannot be clicked. That came from the <code>accessibility</code> block, not from the generator
    guessing.
  </li>
  <li>
    <code>forwardRef</code> throughout, so the component composes with focus management and
    positioning libraries.
  </li>
</ul>

<p>And the CSS — structure and token references, nothing else:</p>

${code(
  `.ds-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  font: inherit;
  cursor: pointer;
  text-decoration: none;
}

.ds-button:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.ds-button:disabled,
.ds-button[aria-disabled="true"],
.ds-button[data-loading="true"] {
  cursor: not-allowed;
  opacity: 0.55;
}

.ds-button {
  font-family: var(--ds-typography-body-family);
  border-radius: var(--ds-button-radius);
}

.ds-button[data-variant="primary"] {
  background: var(--ds-button-primary-background);
  color: var(--ds-button-primary-foreground);
}`,
  { path: 'styles/components.css — real output', kind: 'generated', lang: 'css' },
)}

${rule(
  'Every design value is a var(). No exceptions.',
  `<p>
    Notice what is hardcoded: <code>display</code>, <code>align-items</code>,
    <code>cursor</code>, <code>outline-offset</code>, <code>opacity: 0.55</code>. All structural or
    behavioural. Every value a designer would want to change — colour, radius, font, spacing, size —
    is a <code>var()</code>.
  </p>
  <p>
    This is the property that makes one <code>components.css</code> serve every brand. The structure
    is brand-independent by construction, so there is nothing to duplicate per brand.
  </p>`,
)}

<h2 id="validation">Cross-validation against every brand</h2>

<p>
  <code>validateSpecs(irs, build.graphs, TEMPLATE_REGISTRY)</code> takes the resolved token graphs
  for <em>all</em> brands. That plural is the whole point.
</p>

${danger(
  'The most common real defect in this area',
  `<p>
    A token reference that resolves under the default brand but not under another one. It is easy to
    create: you add <code>{color.tertiary}</code>, it works locally because you are on the default
    brand, and the second brand has no such token. Because validation runs against every graph, this
    is a build error rather than a production surprise — and the diagnostic is prefixed with the
    brand name, so you know which one is missing it.
  </p>`,
)}

${table(
  ['Validation', 'Range', 'What it rejects'],
  [
    ['Name shape', '<code>GIRIH4001</code>', 'A component name that is not PascalCase — it becomes an exported identifier'],
    ['Unknown token ref', '<code>GIRIH4030</code>+', 'A <code>{token}</code> that no brand can resolve'],
    ['Reserved prop', '<code>GIRIH4010</code>+', 'A variant axis colliding with a React or generator prop'],
    ['Unimplementable state', '<code>GIRIH4020</code>+', 'A state the chosen template cannot express'],
    ['Variant default', '<code>GIRIH4005</code>+', 'A default that is not one of the declared values'],
    ['Extension overreach', '<code>GIRIH4040</code>+', 'An extension overriding a token outside <code>overridableTokens</code>'],
  ],
)}

<p>
  There are 31 codes in the <code>GIRIH4xxx</code> range — more than any other family — because a
  contract has the largest surface area of anything a user writes. The full list with messages is in
  <a href="07-error-codes.html">chapter 07</a>.
</p>

${strap()}

<h2 id="extensions">Extensions</h2>

<p>
  Sometimes a consumer needs a variation the design system did not anticipate. The wrong answer is a
  fork. The girih answer is <code>defineVariant</code>: a declaration that extends an existing
  component within limits the base contract set.
</p>

${code(data.sources['extensions/payment-button.ext.ts'] ?? '', {
  path: 'extensions/payment-button.ext.ts',
  kind: 'authored',
})}

<p>That compiles to a component that is a thin wrapper over the base, plus a scoped CSS rule:</p>

${code(data.generated['src/payment-button.tsx'] ?? '', {
  path: 'packages/design-system/src/payment-button.tsx',
  kind: 'generated',
  lang: 'tsx',
})}

<p>
  It inherits <code>ButtonProps</code> exactly, so every variant and size still works, and it adds
  one class that overrides two tokens. Which two it is allowed to override is not the extension's
  choice — the Button's contract declares
  <code>overridableTokens: ['background', 'color', 'borderColor']</code>, and an extension reaching
  outside that list is a build error.
</p>

${gotcha(
  'You cannot eject an extension',
  `<p>
    <code>girih eject PaymentButton</code> refuses, and the error explains why: extensions are pure
    data and always regenerated, so there is nothing to fork. Edit the <code>.ext.ts</code>. If you
    need to fork the <em>markup</em>, you eject the base component instead.
  </p>`,
)}

<h2 id="templates">Templates and the Dialog problem</h2>

<p>
  Most components are one element with attributes — a template called <code>element</code> handles
  Button, Badge, Card, Input. But a Dialog needs focus trapping, scroll locking, escape handling and
  correct ARIA relationships across several nodes. That is not markup; it is behaviour, and writing
  it from scratch is how accessibility bugs are born.
</p>

<p>
  girih's Dialog is built on <a href="https://base-ui.com">Base UI</a>, behind a swappable adapter in
  <code>src/internal/headless.ts</code>. The contract does not mention Base UI at all.
</p>

${rule(
  'Why the adapter matters',
  `<p>
    Headless primitive libraries are young and they churn — the version pinned here is
    <code>1.0.0-rc.0</code>. If the contract named Base UI directly, swapping it would be a breaking
    change for every consumer. Behind an adapter, the underlying library is an implementation detail
    of the generated package: the contract, the emitted API, and the token surface all stay put.
  </p>`,
)}

<p>
  The <code>TEMPLATE_REGISTRY</code> records what each template can express, along with a version
  number. Contract validation consults it — which is how "this state is unimplementable" becomes a
  build error instead of a silently missing CSS rule. The version number matters for ejection, next.
</p>

<h2 id="eject">Ejection: the tracked fork</h2>

<p>
  Occasionally a component genuinely needs hand-written markup. Every generator that pretends
  otherwise gets forked in the dark. girih's answer is to make forking a first-class, recorded
  operation.
</p>

${code(
  `$ pnpm exec girih eject Dialog

create  components/ejected/dialog.tsx
update  ds.lock (base: dialog@v1, 4f2a9c1e8b03)

'Dialog' is now yours: edit components/ejected/dialog.tsx freely — commit it and ds.lock.
Its spec is still validated and its CSS still generated — only markup/behavior is forked.
Run \`girih generate react\` to stitch it into the package.`,
  { kind: 'shell', lang: 'none' },
)}

<p>Four things happen, and each one is doing specific work:</p>

<ol>
  <li>
    The current template output is written to <code>components/ejected/dialog.tsx</code> — your file
    now, committed to git.
  </li>
  <li>
    <code>ds.lock</code> records the template name, the template <em>version</em>, and a hash of the
    exact source the fork started from.
  </li>
  <li>
    Subsequent <code>generate</code> runs stitch your file into the package instead of the
    template's output.
  </li>
  <li>
    The spec is still validated and the CSS is still generated from it. You forked the markup, not
    the token governance.
  </li>
</ol>

${gotcha(
  'Ejecting is also the drift gate’s own remedy',
  `<p>
    If the generated file on disk already had hand edits when you ejected, girih carries
    <em>those</em> into the fork rather than the pristine template output — and says so. Following
    the drift gate's advice must never lose your work. The recorded <code>baseHash</code> stays
    pristine regardless, because that hash is what a future three-way merge would rebase against.
  </p>`,
)}

<p>
  <code>girih forks</code> reports forks that have drifted from their recorded base, on two axes:
  the template version moved, or the spec changed since the eject. The three-way merge itself is not
  implemented — the command tells you honestly that it is a report, not a fix.
</p>

<h2 id="semver">Versioning from the contract diff</h2>

<p>
  Because a contract is data in canonical form, two versions of it can be compared mechanically. So
  girih does not ask you what version to publish. It computes one.
</p>

${table(
  ['Change', 'Bump', 'Reasoning'],
  [
    ['A token value changed', '<code>patch</code>', 'Consumers see different pixels, same API'],
    ['A new variant, size, state or component', '<code>minor</code>', 'Additive — existing code keeps working'],
    ['Anything removed or renamed', '<code>major</code>', 'Some consumer call site is now invalid'],
    ['Nothing changed', '<code>none</code>', 'Publishing would be noise; the command says so and stops'],
  ],
)}

<p>
  The signature hashed for comparison is broader than the specs alone. From
  <code>computeSignature()</code>: the resolved token graphs per brand, the component IRs, the
  extensions, the template versions, the ejected sources, and the emitted file set. Three
  consequences worth internalising:
</p>

<ul>
  <li>A template version bump moves the signature even with no contract edit — because the emitted markup changed.</li>
  <li>Editing an ejected fork affects the published package, so it affects the bump.</li>
  <li>A token value change in <em>any</em> brand counts, not only the default one.</li>
</ul>

${code(
  `$ pnpm exec girih publish

@acme/design-system  0.2.1 → 0.3.0  [minor]
  Button: variant 'tertiary' added
  Badge: token 'badge.primary.background' value changed
  …

Dry run — nothing published, workspace unchanged. Re-run with --yes to publish 0.3.0.`,
  {
    kind: 'shell',
    lang: 'none',
  },
)}

${danger(
  'Dry run by default, and one npm trap girih handles for you',
  `<p>
    <code>girih publish</code> stages the package, prints the diff, runs
    <code>npm publish --dry-run</code>, and cleans up. Only <code>--yes</code> publishes.
  </p>
  <p>
    The trap: a scoped package's <em>first</em> publish is restricted by default on npm and fails
    without <code>--access public</code> — and <code>--dry-run</code> never surfaces that, so you
    find out on the real attempt. girih checks for the scoped-and-never-published case explicitly and
    stops with an explanation before you get there.
  </p>`,
)}

<p>
  That is the model, end to end. <a href="06-the-code.html">Chapter 06</a> maps it onto the actual
  packages, so you know where to look when something misbehaves.
</p>
</div>`;

  return { sections, body, widgets: [] };
}
