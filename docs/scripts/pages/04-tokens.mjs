import { code, eli5, rule, gotcha, danger, aside, table, tierStack, chainDiagram, strap } from '../lib/ui.mjs';
import { brandToggle, tokenWalker } from '../lib/widgets.mjs';
import { tokenGraph, cascadeViz } from '../lib/viz.mjs';

export default function page(data) {
  const toggle = brandToggle(data, { id: 'w-branddemo' });
  const walker = tokenWalker(data, { id: 'w-walker' });
  const graph = tokenGraph(data, { id: 'w-tokengraph' });
  const cascade = cascadeViz({ id: 'w-cascade' });

  const marketplaceChain = data.chains.marketplace['button.radius'];
  const sellerChain = data.chains.seller['button.radius'];

  const sections = [
    { id: 'token', title: 'What a token is, exactly' },
    { id: 'tiers', title: 'Why three tiers' },
    { id: 'aliases', title: 'Alias chains' },
    { id: 'wholegraph', title: 'The whole graph at once' },
    { id: 'walker', title: 'Trace a chain yourself' },
    { id: 'brands', title: 'Brands: the override-only rule' },
    { id: 'live', title: 'The live brand switch' },
    { id: 'closure', title: 'The dependents closure' },
    { id: 'cascade', title: 'Which declaration wins' },
    { id: 'validation', title: 'What girih checks' },
    { id: 'authoring', title: 'Authoring rules' },
  ];

  const body = `
<div class="prose">
<p class="lede">
  This is the chapter that matters. If you understand the three tiers, alias chains, and the
  override-only rule, everything else in girih is a detail. All the values on this page are real —
  extracted by running girih's own engine over <code>examples/acme-ds</code>.
</p>

<h2 id="token">What a token is, exactly</h2>

<p>
  A token is a named design decision written in DTCG JSON. Two keys carry the weight:
  <code>$value</code> and <code>$type</code>.
</p>

${code(
  `{
  "radius": {
    "$type": "dimension",
    "sm":   { "$value": "4px" },
    "md":   { "$value": "8px" },
    "lg":   { "$value": "16px" },
    "pill": { "$value": "999px" }
  }
}`,
  { path: 'tokens/global.tokens.json (excerpt)', kind: 'authored', lang: 'json' },
)}

<p>
  Note that <code>$type</code> is declared once on the group and inherited by every member.
  <code>radius.md</code> is a dimension without saying so itself. girih flattens this into a map
  keyed by dotted path, and that flat map is what every later stage speaks:
</p>

${code(
  `radius.sm    tier=global  type=dimension  value="4px"
radius.md    tier=global  type=dimension  value="8px"
radius.lg    tier=global  type=dimension  value="16px"
radius.pill  tier=global  type=dimension  value="999px"`,
  { path: 'after mergeTokenFiles()', kind: 'generated', lang: 'none' },
)}

${eli5(`
  <p>
    A token is a variable for a design decision. <code>radius.md</code> means "our medium corner
    radius" — and the point of the name is that the <em>meaning</em> stays put while the
    <em>number</em> is free to change. Anything that wants a medium corner asks for the name, so one
    edit moves everything.
  </p>
`)}

<h2 id="tiers">Why three tiers</h2>

<p>
  girih requires tokens to live in one of three tiers. The tier is inferred from the filename —
  <code>global*.tokens.json</code>, <code>semantic*.tokens.json</code>, and anything under
  <code>tokens/components/</code> — and a file girih cannot classify gets a
  <code>GIRIH2004</code> warning and is treated as semantic.
</p>

${tierStack([
  {
    tier: 'component',
    name: 'Component',
    sub: `${data.counts.tiers.component} tokens in the example`,
    chips: [{ text: 'button.radius' }, { text: 'button.primary.background' }, { text: 'input.border-focus' }, { text: 'dialog.backdrop' }],
  },
  {
    tier: 'semantic',
    name: 'Semantic',
    sub: `${data.counts.tiers.semantic} tokens`,
    chips: [{ text: 'radius.control' }, { text: 'color.primary' }, { text: 'color.on-primary' }, { text: 'typography.size-md' }],
  },
  {
    tier: 'global',
    name: 'Global',
    sub: `${data.counts.tiers.global} tokens`,
    chips: [{ text: 'radius.md = 8px' }, { text: 'color.blue.600 = #2563EB' }, { text: 'space.4 = 16px' }],
  },
])}

<p>Each tier answers a different question, and the questions are asked by different people:</p>

${table(
  ['Tier', 'Answers', 'Example', 'Who changes it'],
  [
    [
      '<b>Global</b>',
      'What values exist in our palette at all?',
      '<code>color.blue.600 = #2563EB</code>',
      'Rarely — this is the raw material',
    ],
    [
      '<b>Semantic</b>',
      'What does this value <em>mean</em> to us?',
      '<code>color.primary = {color.blue.600}</code>',
      'Design leads; brands override here most',
    ],
    [
      '<b>Component</b>',
      'What does <em>this component</em> use?',
      '<code>button.primary.background = {color.primary}</code>',
      'Whoever owns the component',
    ],
  ],
)}

${rule(
  'The tier rule',
  `<p>
    A reference may point at its own tier or a lower one. Never upward. Component may reference
    semantic and global; semantic may reference global; global references nothing. Violations are a
    build error, reported by <code>validateTierDirection()</code>.
  </p>
  <p>
    Without this rule the tiers are just folders. With it, you can reason about blast radius: a
    global change may affect anything, a component change affects that component. That guarantee is
    the whole return on the extra indirection.
  </p>`,
)}

${aside(
  'Why not two tiers? Or four? — the argument for exactly three',
  `
  <p>
    <b>Two tiers</b> (raw + component) means every component references raw values directly. Change
    "our primary blue" and you must edit every component that used the blue — and you must know
    which uses of <code>blue.600</code> meant "primary" versus "that particular blue". The
    information about <em>why</em> a value was chosen is nowhere.
  </p>
  <p>
    <b>Four or more tiers</b> is where teams usually end up by accretion, and the cost is that
    nobody can predict where a value comes from. Each hop is a place to look during debugging. The
    example workspace's longest chain is three hops, which is already enough that the
    <a href="#walker">walker widget below</a> earns its keep.
  </p>
  <p>
    <b>Three</b> is the smallest number that separates the three questions in the table above:
    what exists, what it means, what uses it. That separation is what makes a brand overlay a
    values-only operation.
  </p>
`,
)}

<h2 id="aliases">Alias chains</h2>

<p>
  A token whose <code>$value</code> is <code>{another.token}</code> is an alias. Chains form
  naturally from the tier structure. Here is the real chain for a button's corner radius on the
  default brand:
</p>

${chainDiagram(marketplaceChain)}

<p>
  Three hops, three tiers, and only the last one holds an actual number. Now the same chain on the
  <code>seller</code> brand — same structure, one overridden value:
</p>

${chainDiagram(sellerChain)}

<p>
  The highlighted row is the override. Note where it is: <code>radius.md</code>, in the
  <em>global</em> tier. The seller brand did not touch <code>button.radius</code> at all. It changed
  a raw value two levels down, and the change arrived at the button through the alias chain. That is
  the three-tier design paying for itself.
</p>

${gotcha(
  'This is also why the chain reaches things you did not think about',
  `<p>
    <code>input.radius</code> and <code>checkbox.radius</code> also point at
    <code>radius.control</code> (well, <code>radius.control-sm</code> for the checkbox). So the
    seller override reaches them too, automatically. That is usually exactly what you want — and it
    is exactly why you should override at the lowest tier that expresses your intent, not the
    highest one you can reach.
  </p>`,
)}

<h2 id="walker">Trace a chain yourself</h2>

<p>
  Pick a token and a brand and step down the chain. Everything here is read from the resolved graph
  girih produced; nothing is hardcoded.
</p>

${walker.html}

<h2 id="wholegraph">The whole graph at once</h2>

<p>
  Individual chains are one thing; the shape of the whole token set is another. Below is every
  token in the example workspace, arranged by tier, with an edge for every
  <code>{alias}</code> reference. Hover or keyboard-focus any node to light the chain it resolves
  through and see how many other tokens depend on it.
</p>

${graph.html}

<p>
  Two things are worth noticing. The bottom band is almost entirely leaves — global tokens hold
  values and reference nothing, so no edge ever leaves them heading further down. And the fan-out
  from a handful of semantic tokens is dramatic: <code>color.primary</code> alone reaches every
  component that has a primary anything, which is precisely why it is the token brands override
  most. Hover it and count the lit edges.
</p>

<h2 id="brands">Brands: the override-only rule</h2>

<p>
  A brand is a folder with one file. The <code>marketplace</code> brand is the default and overrides
  nothing at all, so its file is literally empty:
</p>

${code(`{}`, { path: 'brands/marketplace/tokens.json', kind: 'authored', lang: 'json' })}

<p>The <code>seller</code> brand overrides exactly three values:</p>

${code(data.sources['brands/seller/tokens.json'] ?? '{}', {
  path: 'brands/seller/tokens.json',
  kind: 'authored',
  lang: 'json',
})}

${danger(
  'An overlay may only override. Never add.',
  `<p>
    If <code>brands/seller/tokens.json</code> introduced a path that does not exist in the base
    token set, that is an error — not a merge. The reason is structural: if brands could add tokens,
    a component contract could reference a token that exists for one brand and not another, and
    there would be no such thing as "one component set that serves every brand". Every brand must
    end up with an identical set of paths, which <code>validateBrandParity()</code> checks
    explicitly.
  </p>
  <p><b>Brands are skins, never forks.</b> This rule is what that slogan cashes out to.</p>`,
)}

<h2 id="live">The live brand switch</h2>

<p>
  Below is the real generated CSS from <code>examples/acme-ds</code> — both
  <code>tokens.css</code> and <code>components.css</code>, embedded verbatim into this page — with
  markup matching what the generated React components render. Switching brands changes one
  attribute. No stylesheet is swapped, nothing is rebuilt, no JavaScript recalculates a value.
</p>

${toggle.html}

<p>
  Watch the corner radius as well as the colour. The colour comes from a semantic override
  (<code>color.primary</code>); the radius comes from a global one (<code>radius.md</code>) that has
  to travel two hops. Both arrive through the same mechanism.
</p>

${rule(
  'Why the PaymentButton does not change colour',
  `<p>
    <code>PaymentButton</code> is an extension that pins its background to <code>{color.text}</code>
    and its foreground to <code>{color.background}</code> — neither of which any brand overrides. It
    is deliberately brand-independent: a checkout call-to-action that should look identical
    everywhere. Extensions are covered in <a href="05-contracts.html">chapter 05</a>.
  </p>`,
)}

<h2 id="closure">The dependents closure</h2>

<p>
  Here is the part that trips people up. The seller brand overrides three tokens. Its CSS block
  contains twelve declarations:
</p>

${code(
  `[data-brand="seller"] {
  --ds-radius-md: 2px;                                        /* overridden */
  --ds-color-primary: var(--ds-color-green-600);              /* overridden */
  --ds-color-primary-hover: var(--ds-color-green-700);        /* overridden */
  --ds-radius-control: var(--ds-radius-md);                   /* dependent */
  --ds-badge-primary-background: var(--ds-color-primary);     /* dependent */
  --ds-button-primary-background: var(--ds-color-primary);    /* dependent */
  --ds-button-primary-background-hover: var(--ds-color-primary-hover);
  --ds-button-radius: var(--ds-radius-control);               /* dependent */
  --ds-checkbox-background-checked: var(--ds-color-primary);  /* dependent */
  --ds-checkbox-border-hover: var(--ds-color-primary);        /* dependent */
  --ds-input-border-focus: var(--ds-color-primary);           /* dependent */
  --ds-input-radius: var(--ds-radius-control);                /* dependent */
}`,
  { path: 'styles/tokens.css — real output', kind: 'generated', lang: 'css' },
)}

<p>
  The nine extra declarations are the <b>dependents closure</b>: every token that transitively
  references an overridden one. They are there because of a specific property of CSS custom
  properties that is easy to state and easy to forget.
</p>

${gotcha(
  'Custom properties are computed where they are declared',
  `<p>
    Suppose the emitter had written only the three overrides into the seller block, leaving
    <code>--ds-button-radius: var(--ds-radius-control)</code> in <code>:root</code>. Inside a
    <code>[data-brand="seller"]</code> element, what is <code>--ds-button-radius</code>?
  </p>
  <p>
    It is <code>8px</code>. The declaration lives in <code>:root</code>, so it was computed against
    <code>:root</code>'s <code>--ds-radius-control</code>, which resolves to <code>:root</code>'s
    <code>--ds-radius-md</code> — the un-overridden <code>8px</code>. The brand's <code>2px</code>
    is simply never consulted. Colour would appear to work (a direct reference) while radius
    silently would not (a two-hop reference), which is the worst possible failure mode: partial.
  </p>
  <p>
    Re-declaring the chain inside the scope fixes it, because now the whole chain is computed there.
    That is <code>dependentsClosure()</code> in
    <code>packages/generator-css/src/generate.ts</code>, and it is about twenty lines of
    reverse-graph walk.
  </p>`,
)}

<h2 id="cascade">Which declaration wins</h2>

<p>
  That is a lot of words for something you can just try. Turn the closure off and watch the
  resolved value change — and note that colour would still appear to work, because
  <code>color.primary</code> is a direct reference while radius needs two hops. Partial failure is
  the whole danger.
</p>

${cascade.html}

${aside(
  'The default brand gets a scoped block too — and that is not redundant',
  `
  <p>
    Look at the real output and you will find both <code>:root</code> <em>and</em>
    <code>[data-brand="marketplace"]</code>, even though marketplace is the default and overrides
    nothing. Why emit a block for a brand with no overrides?
  </p>
  <p>
    Because of nesting. Consider a seller-branded page containing a marketplace-branded widget:
    <code>&lt;div data-brand="seller"&gt;&lt;div data-brand="marketplace"&gt;</code>. Without a
    marketplace block, the inner div inherits the seller values — the outer scope's declarations are
    still in effect and nothing resets them. So the default brand's block re-declares the closure of
    every token that <em>any</em> brand overrides, which restores the base values inside that scope.
  </p>
  <p>
    This is the kind of detail that only shows up in a real product, usually as a bug report about
    one widget on one page looking wrong.
  </p>
`,
)}

<h2 id="validation">What girih checks</h2>

${table(
  ['Check', 'Code', 'Catches'],
  [
    ['Unknown reference', '<code>GIRIH2030</code>', 'A <code>{typo}</code> — with "did you mean" suggestions from the real token set'],
    ['Circular reference', '<code>GIRIH2031</code>', 'A → B → A, reported with the full chain, once per cycle'],
    ['Tier direction', '<code>GIRIH2040</code>–<code>GIRIH2042</code>', 'A reference pointing upward through the tiers'],
    ['Brand parity', '<code>GIRIH2020</code>–<code>GIRIH2021</code>', 'One brand having a token another lacks'],
    ['Overlay adds a path', '<code>GIRIH2010</code>–<code>GIRIH2011</code>', 'A brand trying to introduce a new token'],
    ['Unclassifiable file', '<code>GIRIH2004</code>', 'A token file whose tier cannot be inferred from its name'],
    ['CSS var collision', '<code>GIRIH3003</code>', 'Two token paths mapping to the same custom property name'],
    ['Unflattenable value', '<code>GIRIH3002</code>', 'A composite value no CSS transform could serialize'],
  ],
)}

${gotcha(
  'The collision check is subtler than it looks',
  `<p>
    <code>color.primary.hover</code> and <code>color.primary-hover</code> are different token paths.
    Both become <code>--ds-color-primary-hover</code>, because the name transform joins segments
    with a hyphen and lowercases. In CSS that is a silent last-one-wins. girih makes it
    <code>GIRIH3003</code>, a hard error — one of those bugs that would otherwise cost an afternoon.
  </p>`,
)}

${strap()}

<h2 id="authoring">Authoring rules</h2>

<p>Practical guidance, in rough order of how often it matters:</p>

<ol>
  <li>
    <strong>Name the tier in the filename.</strong> <code>global*.tokens.json</code>,
    <code>semantic*.tokens.json</code>, or under <code>tokens/components/</code>. Otherwise you get
    a warning and a possibly wrong tier.
  </li>
  <li>
    <strong>Override at the lowest tier that expresses your intent.</strong> Overriding
    <code>radius.md</code> says "this brand is squarer". Overriding
    <code>button.radius</code> says "this brand's buttons are squarer, and I accept that inputs and
    checkboxes will not match". Both are legitimate; only one is usually meant.
  </li>
  <li>
    <strong>Keep names lowercase and kebab-case.</strong> They become CSS custom property names.
    Mixed case invites the collision above.
  </li>
  <li>
    <strong>Declare <code>$type</code> on the group, not per token.</strong> Less repetition and it
    inherits correctly.
  </li>
  <li>
    <strong>Do not create a semantic token with one consumer.</strong> If exactly one component uses
    it, it is a component token wearing a disguise, and the indirection costs a debugging hop.
  </li>
  <li>
    <strong>Run <code>girih check</code> before you commit.</strong> It prints the resolved value of
    every token for a chosen brand — <code>--brand seller</code> — which is faster than reasoning
    about the chain in your head.
  </li>
</ol>

${code(
  `$ pnpm exec girih check --brand seller

TOKEN                     TIER       TYPE       RESOLVED (seller)
button.radius             component  dimension  2px
button.primary.background component  color      #16A34A
radius.control            semantic   dimension  2px
radius.md                 global     dimension  2px
…

6 component contracts: Badge, Button, Card, Checkbox, Dialog, Input
1 extension: PaymentButton → Button
${data.counts.tokens} tokens (${data.counts.tiers.global} global, ${data.counts.tiers.semantic} semantic, ${data.counts.tiers.component} component) · 2 brands: marketplace (default), seller (3 overrides)`,
  {
    kind: 'shell',
    lang: 'none',
  },
)}

<p>
  Tokens are the hard half. <a href="05-contracts.html">Chapter 05</a> is about the other half:
  turning a contract into a component that uses them.
</p>
</div>`;

  return { sections, body, widgets: [toggle, walker, graph, cascade] };
}
