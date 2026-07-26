import { code, eli5, rule, gotcha, aside, table, tierStack, strap } from '../lib/ui.mjs';

export default function page(data) {
  const sections = [
    { id: 'deep', title: 'Deep background: what a design system is' },
    { id: 'drift', title: 'The problem: drift' },
    { id: 'forks', title: 'Why multi-brand makes it worse' },
    { id: 'tiles', title: 'The girih tiles' },
    { id: 'bet', title: 'The bet girih makes' },
    { id: 'consequences', title: 'What follows from the bet' },
    { id: 'notthis', title: 'What girih deliberately does not do' },
  ];

  const body = `
<div class="prose">
<p class="lede">
  Every design system starts consistent and ends inconsistent. This chapter is about why that
  happens with such reliability, why having more than one brand accelerates it, and what a
  twelfth-century Persian tiling technique suggests about the fix.
</p>

${aside(
  'Skip this if you already work with design tokens — deep background for newcomers',
  `
  <p>
    A <b>design system</b> is the shared vocabulary a product uses to look like itself: the blues,
    the spacing rhythm, the corner radius, the type scale, and the components built from them. In
    a small product this lives in someone's head. Past a certain size it has to live somewhere a
    machine can read.
  </p>
  <p>
    A <b>design token</b> is one named design decision. Instead of writing <code>#2563EB</code> in
    forty files, you write it once as <code>color.blue.600</code> and refer to the name. The value
    can change in one place. That is the whole idea, and it is genuinely most of the value.
  </p>
  <p>
    <b>DTCG</b> — the Design Tokens Community Group format — is the emerging standard for writing
    tokens down. It is JSON, and its two important keys are <code>$value</code> (the value) and
    <code>$type</code> (what kind of thing it is: colour, dimension, fontWeight). A reference to
    another token is written in curly braces: <code>{color.blue.600}</code>. girih reads DTCG.
  </p>
  <p>
    A <b>CSS custom property</b> — what people usually call a CSS variable — looks like
    <code>--ds-color-primary: #2563EB</code> and is used as
    <code>background: var(--ds-color-primary)</code>. The critical property, and the one girih
    leans on hardest, is that custom properties are <em>inherited and re-computed per element</em>.
    Redeclare one inside a nested element and everything inside that element sees the new value.
    Chapter 04 turns that fact into multi-brand theming.
  </p>
`,
)}

<h2 id="deep">Deep background: what a design system is</h2>

<p>
  Suppose your product uses a particular blue. In the beginning, that blue lives in one stylesheet
  and everything is fine. Then someone builds a feature in a hurry and types the hex code directly.
  Then a designer lightens the blue, and the stylesheet changes but the hardcoded copy does not.
  Now your product has two blues, and nobody notices for six weeks, and when they do notice the
  fix is a search-and-replace across a codebase where some of those hex codes are the <em>same
  colour used for an unrelated purpose</em> and must not change.
</p>

<p>
  This is not a discipline problem. It is a structural one. The system had no way to make the
  wrong thing hard.
</p>

<h2 id="drift">The problem: drift</h2>

<p>
  Design systems fail in a specific, repeatable sequence. It is worth naming the steps because
  girih is built to interrupt each one.
</p>

${table(
  ['Stage', 'What happens', 'Why the usual fix fails'],
  [
    [
      '<b>1. Bypass</b>',
      'A hardcoded value ships because the token did not exist yet and the deadline did.',
      'Linting for hex codes catches the syntax, not the decision. The value still needed a home.',
    ],
    [
      '<b>2. Local override</b>',
      'A team needs a slightly different button. They add a CSS override next to their feature.',
      'Nothing is technically wrong, so review approves it. The override is invisible to the system.',
    ],
    [
      '<b>3. Fork</b>',
      'The override grows into a copy of the component with three changes.',
      'Now upstream fixes have to be applied twice, and eventually are not.',
    ],
    [
      '<b>4. Divergence</b>',
      'The copies drift apart. The design system is now documentation of a past state.',
      'A rewrite is proposed. The cycle restarts with better intentions.',
    ],
  ],
)}

${eli5(`
  <p>
    Drift is what happens when the easy thing and the correct thing are different things. Every
    stage above is somebody making a reasonable local decision that is bad globally. You cannot
    fix that with a style guide, because a style guide is advice and deadlines are not.
  </p>
`)}

<h2 id="forks">Why multi-brand makes it worse</h2>

<p>
  Add a second brand and the pressure to fork multiplies, because now there is a
  <em>legitimate-sounding reason</em> for the copy. The marketplace needs a blue button; the seller
  console needs a green one. The fastest path is <code>SellerButton.tsx</code>.
</p>

<p>
  The moment that file exists, you own two buttons forever. Every accessibility fix, every focus
  ring adjustment, every new size — twice. And the second copy is always the one that gets
  forgotten, because it belongs to whichever team is smaller.
</p>

<p>
  The alternative that most teams try next is a theme object passed through React context, with
  components reading values at render time. It works, and it has two costs that only show up later:
  every themed component becomes a client component with a runtime dependency, and the theme
  becomes a JavaScript object that no stylesheet, linter, or designer can see.
</p>

${strap()}

<h2 id="tiles">The girih tiles</h2>

<p>
  Girih (گره, Persian for "knot") is the strapwork you see on mosques and madrasas across Iran and
  Central Asia — interlacing geometric bands forming stars and polygons of bewildering complexity.
  For a long time Western scholarship assumed each pattern was drafted individually with compass
  and straightedge, which would make them extraordinary feats of individual draughtsmanship.
</p>

<p>
  The more interesting explanation, argued from surviving pattern scrolls, is that medieval
  craftsmen worked from a small kit of five tiles — a decagon, a pentagon, an elongated hexagon, a
  rhombus, and a bowtie — each carrying the same decorative lines across its edges at the same
  angles. Because the edge treatments matched, any tile could sit beside any other and the lines
  would continue unbroken. The dazzling pattern is not drawn; it is <em>assembled</em>, and it
  emerges from a shared contract at the edges.
</p>

<div class="bleed" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:0.85rem;margin:1.75rem 0">
  ${[
    ['Decagon', '10 sides', 'The anchor. Stars sit here.'],
    ['Pentagon', '5 sides', 'Fills between decagons.'],
    ['Hexagon', 'elongated', 'Bridges across gaps.'],
    ['Rhombus', '4 sides', 'Takes up the slack.'],
    ['Bowtie', 'concave', 'The awkward corners.'],
  ]
    .map(
      ([n, s, d]) => `<div style="border:1px solid var(--rule);border-radius:var(--radius-lg);padding:0.8rem;background:var(--bg-raised)">
    <div style="font-family:var(--util);font-size:var(--t-sm);font-weight:700">${n}</div>
    <div style="font-family:var(--mono);font-size:var(--t-xs);color:var(--text-faint);margin-bottom:0.3rem">${s}</div>
    <div style="font-family:var(--util);font-size:var(--t-xs);color:var(--text-muted);line-height:1.45">${d}</div>
  </div>`,
    )
    .join('\n  ')}
</div>

${rule(
  'The analogy, precisely',
  `<p>
    The five tiles are the <b>component contracts</b>. The matched edge treatment is the
    <b>token contract</b> — the guarantee that every component references design values by name
    rather than baking them in. The endless variety of finished patterns is your <b>brands</b>.
    You do not get variety by cutting new tiles. You get it by re-glazing the same ones.
  </p>`,
)}

<p>
  The name is a claim about where variety should come from. In a girih workspace, a new brand is
  never a new component; it is a set of values applied to the components that already exist. If
  producing a brand requires new structure, something upstream was specified too narrowly — and
  girih will tell you so, because a brand overlay that introduces a new token path is an error.
</p>

<h2 id="bet">The bet girih makes</h2>

<p>The bet has three parts, and each one is falsifiable:</p>

<ol>
  <li>
    <strong>Components should be generated, not written.</strong> If a component is compiled from a
    description, the description can be validated, diffed, and versioned. A hand-written component
    can only be reviewed by a person who remembers the rules.
  </li>
  <li>
    <strong>Brands should be values, never structure.</strong> Enforced mechanically: an overlay may
    replace an existing token's value and nothing else.
  </li>
  <li>
    <strong>Rebranding should happen in the browser, not the build.</strong> If the emitted CSS keeps
    aliases as live <code>var()</code> references, then a brand switch is one attribute change. No
    second stylesheet, no rebuild, no bundle per brand.
  </li>
</ol>

<p>
  Point three is the one that sounds like a detail and is actually the load-bearing wall. Here is
  the difference, using real values from the example workspace:
</p>

${code(`/* If aliases were flattened to literals — the naive approach */
:root                      { --ds-button-radius: 8px; }
[data-brand="seller"]      { --ds-button-radius: 2px; }
/* Every dependent value must be recomputed and re-emitted by the build.
   Miss one and the brand is subtly wrong. */

/* What girih actually emits — aliases stay live */
:root                      { --ds-radius-md: 8px;
                             --ds-radius-control: var(--ds-radius-md);
                             --ds-button-radius: var(--ds-radius-control); }
[data-brand="seller"]      { --ds-radius-md: 2px;
                             --ds-radius-control: var(--ds-radius-md);
                             --ds-button-radius: var(--ds-radius-control); }
/* The seller block redeclares the chain, so the whole chain re-resolves
   inside that scope. The browser does the work, at any depth of nesting. */`, {
    path: 'the difference between flattened and live aliases',
    lang: 'css',
    kind: 'generated',
  })}

${gotcha(
  'Why the chain has to be redeclared, not just the root',
  `<p>
    A custom property is computed <em>where it is declared</em>. If
    <code>--ds-button-radius: var(--ds-radius-control)</code> appears only in
    <code>:root</code>, it resolves against <code>:root</code>'s
    <code>--ds-radius-control</code> and will happily ignore a nested
    <code>[data-brand]</code> scope that overrode it. So a brand block must re-declare not only the
    tokens it overrode but every token that transitively references them. girih computes that set —
    the <b>dependents closure</b> — and this is why the seller block in the example contains twelve
    declarations for three overrides.
  </p>`,
)}

<h2 id="consequences">What follows from the bet</h2>

<p>
  Almost every feature in girih is a consequence of those three commitments rather than an
  independent idea. Read this table as "because X, therefore Y":
</p>

${table(
  ['Because…', '…girih has to'],
  [
    ['Components are generated from a description', 'Validate the description against every brand, not just the default one'],
    ['The output is a build artifact', 'Detect hand edits and refuse to overwrite them — <code>.ds/manifest.json</code>'],
    ['People will occasionally need to escape the generator', 'Offer a <em>tracked</em> fork (<code>girih eject</code>) rather than letting them fork silently'],
    ['The contract is data', 'Be able to diff two contracts, and therefore derive the semver bump mechanically'],
    ['Aliases must stay live', 'Compute the dependents closure per brand and re-declare it in scope'],
    ['One stylesheet serves every brand', 'Keep component CSS structure-only, with every design value a <code>var()</code>'],
  ],
)}

${tierStack(
  [
    {
      tier: 'component',
      name: 'Component',
      sub: 'what a Button decides',
      chips: [{ text: 'button.radius → {radius.control}', state: 'lit' }],
    },
    {
      tier: 'semantic',
      name: 'Semantic',
      sub: 'what "a control" means',
      chips: [{ text: 'radius.control → {radius.md}', state: 'lit' }],
    },
    {
      tier: 'global',
      name: 'Global',
      sub: 'the raw number',
      chips: [{ text: 'radius.md = 8px', state: 'hot' }],
    },
  ],
  { flowLabel: 'references downward' },
)}

<p style="font-family:var(--util);font-size:var(--t-sm);color:var(--text-muted)">
  The seller brand overrides only the highlighted global token. Because references flow downward
  and stay live, that single change reaches the button's corner radius through two hops — and it
  would reach the input's radius too, since <code>input.radius</code> also points at
  <code>radius.control</code>.
</p>

<h2 id="notthis">What girih deliberately does not do</h2>

<p>
  A tool's boundaries explain it as much as its features. These are choices, not gaps:
</p>

<ul>
  <li>
    <strong>No runtime style engine.</strong> No CSS-in-JS, no style props, no theme object read at
    render time. Styling is CSS; the only runtime is a context provider that sets an attribute.
  </li>
  <li>
    <strong>No visual editor.</strong> Tokens are files in git. A designer changing a value opens a
    pull request, and that is the intended friction.
  </li>
  <li>
    <strong>No component catalog to adopt.</strong> The six components in the example exist to prove
    the mechanism. Your catalog is yours.
  </li>
  <li>
    <strong>No escape hatch that hides.</strong> You may fork a component, but the fork is recorded
    in a committed <code>ds.lock</code> and its CSS is still generated from the contract. Opting out
    of the markup does not opt you out of the token governance.
  </li>
</ul>

<p>
  With the reasoning in place, the mechanics are much easier to follow.
  <a href="02-installation.html">Chapter 02</a> gets something on your screen.
</p>
</div>`;

  return { sections, body, widgets: [] };
}
