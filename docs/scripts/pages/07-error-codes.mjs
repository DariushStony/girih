import { code, eli5, rule, gotcha, table, esc, strap } from '../lib/ui.mjs';

/** `${token.path}` inside a message is a runtime placeholder — mark it as such. */
function renderMessage(message) {
  return esc(message).replace(/\$\{[^}]*\}/g, (m) => `<i class="ph">${m}</i>`);
}

const FAMILY_ELI5 = {
  1: {
    title: 'Workspace and bookkeeping',
    text: `Something about the shape of your workspace, rather than the design system itself: the config
      file is missing or malformed, a brand points at a file that is not there, the manifest or
      <code>ds.lock</code> is corrupt, or a generated file was edited by hand. These are the codes you
      hit on day one and then rarely again — with one exception,
      <code>GIRIH1010</code>, which is the drift gate and will visit you regularly.`,
  },
  2: {
    title: 'Tokens',
    text: `Your design language does not hold together. A reference points at nothing, two tokens
      reference each other in a loop, a reference points upward through the tiers, a brand tried to add
      a token instead of overriding one, or two brands ended up with different token sets. Most of the
      time the message names the exact path, and <code>GIRIH2030</code> also guesses what you meant.`,
  },
  3: {
    title: 'CSS emission',
    text: `Only three codes, and all three are about the output being untrustworthy rather than
      malformed: generation failed outright, a composite value could not be flattened into a CSS
      string, or two different token paths collapse to the same CSS variable name. The last one would
      be a silent last-one-wins if girih did not stop for it.`,
  },
  4: {
    title: 'Component contracts',
    text: `The largest family, because a contract has the largest surface a user can get wrong: names,
      variants and their defaults, states the template cannot express, prop collisions, token
      references that do not resolve for every brand, and extensions reaching past
      <code>overridableTokens</code>. If you are writing contracts, this is your range.`,
  },
  5: {
    title: 'React emission',
    text: `One code. It fires when a contract maps ARIA attributes to a state that the chosen template
      only expresses in CSS — so the attributes would not actually be wired up. A warning rather than an
      error, because the component still works; it is just less accessible than the contract claims.`,
  },
  6: {
    title: 'Build and publish',
    text: `One code, guarding the packaging step: there are no TypeScript sources to compile, which
      means <code>girih generate react</code> has not run yet.`,
  },
};

export default function page(data) {
  const diagnostics = data.diagnostics;
  const families = diagnostics.families;

  const sections = [
    { id: 'anatomy', title: 'Anatomy of a diagnostic' },
    { id: 'families', title: 'The six families' },
    { id: 'reference', title: 'The full reference' },
    { id: 'gaps', title: 'An honest note on coverage' },
  ];

  const familyBlocks = Object.entries(families)
    .map(([digit, family]) => {
      const eli = FAMILY_ELI5[digit] ?? { title: family.topic, text: '' };
      const codes = diagnostics.codes.filter((c) => c.code.startsWith(`GIRIH${digit}`));
      const cards = codes
        .map(
          (c) => `<div class="codecard" data-sev="${esc(c.severity)}" data-code="${esc(c.code)}" data-search="${esc(
            (c.code + ' ' + c.message + ' ' + (c.help ?? '') + ' ' + c.package).toLowerCase(),
          )}">
        <div class="top">
          <span class="cid">${esc(c.code)}</span>
          <span class="sev">${esc(c.severity)}</span>
          <span class="src">${esc(c.file)}:${c.line}${c.sites > 1 ? ` (+${c.sites - 1} more)` : ''}</span>
        </div>
        <p class="msg">${renderMessage(c.message)}</p>
        ${c.help ? `<p class="help">${renderMessage(c.help)}</p>` : ''}
      </div>`,
        )
        .join('\n      ');

      return `<section data-family="${esc(digit)}">
  <h3 id="family-${esc(digit)}"><code>${esc(family.range)}</code> — ${esc(eli.title)}</h3>
  <p style="font-family:var(--util);font-size:var(--t-sm);color:var(--text-muted)">
    Owned by <code>${esc(family.owner)}</code> · ${codes.length} code${codes.length === 1 ? '' : 's'}
  </p>
  <p>${eli.text}</p>
  <div class="codelist">
      ${cards}
  </div>
</section>`;
    })
    .join('\n\n');

  const body = `
<div class="prose">
<p class="lede">
  All ${diagnostics.total} diagnostics girih can emit — ${diagnostics.bySeverity.error} errors and
  ${diagnostics.bySeverity.warning} warnings — extracted straight from
  <code>packages/*/src</code> by a script. The messages below are the real strings, not paraphrases.
</p>

${rule(
  'This page is generated',
  `<p>
    <code>docs/scripts/extract-diagnostics.mjs</code> parses every
    <code>{ code: 'GIRIH…', severity, message, help }</code> object literal out of the TypeScript
    sources and writes <code>docs/data/diagnostics.json</code>, which this page renders. Re-run it
    after changing any diagnostic; <code>--check</code> exits non-zero if the JSON is stale, so it can
    guard a commit.
  </p>
  <p>
    A hand-written reference would go quietly wrong the first time somebody improved a
    <code>help</code> string. This one cannot.
  </p>`,
)}

<h2 id="anatomy">Anatomy of a diagnostic</h2>

<p>
  girih almost never throws. Problems are values with a stable shape, which is what makes them
  greppable, testable, and machine-readable:
</p>

${code(
  `error GIRIH2030: 'button.primary.background' references '{color.primaryy}', which does not exist.
      │         │      └─ message, with the offending path interpolated
      │         └─ stable code — safe to grep for, safe to assert in a test
      └─ severity: error | warning | info
  help: Did you mean '{color.primary}' or '{color.primary-hover}'?
      └─ one line, actionable, and computed from your actual token set`,
  {
    kind: 'shell',
    lang: 'none',
  },
)}

${eli5(`
  <p>
    Each code is a permanent name for one specific problem. The number never changes and is never
    reused, so you can search this page, search the codebase, or search your CI logs and get the same
    answer. Passages marked <i class="ph">\${like this}</i> below are placeholders — at runtime girih
    fills in your file name, token path, or component name.
  </p>
`)}

<div class="filterbar">
  <input type="search" id="codefilter" placeholder="Filter — try 'cycle', 'brand', 'GIRIH40', 'drift'" aria-label="Filter diagnostics">
  <span class="seg" role="group" aria-label="Severity">
    <button type="button" data-sev-filter="all" aria-pressed="true">All</button>
    <button type="button" data-sev-filter="error" aria-pressed="false">Errors</button>
    <button type="button" data-sev-filter="warning" aria-pressed="false">Warnings</button>
  </span>
  <span id="codecount" style="font-family:var(--util);font-size:var(--t-xs);color:var(--text-muted);font-variant-numeric:tabular-nums"></span>
</div>

<h2 id="families">The six families</h2>

<p>
  Codes are partitioned by the package that raises them. The range tells you where to look in the
  source before you have read a word of the message.
</p>

${table(
  ['Range', 'Owner', 'Covers', 'Codes'],
  Object.entries(families).map(([digit, f]) => [
    `<a href="#family-${digit}"><code>${f.range}</code></a>`,
    `<code>${f.owner}</code>`,
    f.topic,
    `<span class="num">${f.codes.length}</span>`,
  ]),
  { align: [null, null, null, 'num'] },
)}

${gotcha(
  'Stay in your range, and never reuse a retired number',
  `<p>
    If you add a diagnostic, it belongs in the range of the package raising it. Reusing a retired
    number is worse than skipping one: somebody's CI filter, runbook, or test is still matching on the
    old meaning. Gaps in the numbering are free; collisions are not.
  </p>`,
)}

${strap()}

<h2 id="reference">The full reference</h2>

${familyBlocks}

<p id="noresults" class="hidden" style="font-family:var(--util);color:var(--text-muted);padding:1.5rem;text-align:center;border:1px dashed var(--rule-strong);border-radius:var(--radius-lg)">
  No diagnostics match that filter.
</p>

<h2 id="gaps">An honest note on coverage</h2>

<p>
  ${diagnostics.codes.filter((c) => !c.help).length} of the ${diagnostics.total} diagnostics have no
  <code>help</code> line. The project's own convention is that anything actionable should carry a
  one-line suggestion, so that number is a real gap rather than a deliberate choice — most of the
  missing ones are in the <code>GIRIH4xxx</code> contract family, where the message is often
  self-explanatory but a pointer to the right field would still save time.
</p>

<p>
  It is recorded here rather than smoothed over, because a reference that quietly implies full
  coverage is worse than one that names its gaps. If you are adding a diagnostic, add the
  <code>help</code>.
</p>

${code(
  `# regenerate after changing any diagnostic
node docs/scripts/extract-diagnostics.mjs

# fail if the committed JSON is stale — suitable for a pre-commit hook or CI
node docs/scripts/extract-diagnostics.mjs --check`,
  { kind: 'shell', lang: 'none' },
)}
</div>`;

  const script = `
(function () {
  var input = document.getElementById('codefilter');
  var count = document.getElementById('codecount');
  var none  = document.getElementById('noresults');
  if (!input) return;

  var cards = Array.prototype.slice.call(document.querySelectorAll('.codecard'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('section[data-family]'));
  var sevFilter = 'all';

  function apply() {
    var q = input.value.trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (card) {
      var matchesText = !q || card.getAttribute('data-search').indexOf(q) !== -1;
      var matchesSev = sevFilter === 'all' || card.getAttribute('data-sev') === sevFilter;
      var show = matchesText && matchesSev;
      card.classList.toggle('hidden', !show);
      if (show) shown++;
    });
    // Hide a family heading entirely when nothing in it matches.
    sections.forEach(function (section) {
      var any = section.querySelectorAll('.codecard:not(.hidden)').length > 0;
      section.classList.toggle('hidden', !any);
    });
    count.textContent = shown + ' of ' + cards.length + ' shown';
    none.classList.toggle('hidden', shown !== 0);
  }

  input.addEventListener('input', apply);
  document.querySelectorAll('[data-sev-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      sevFilter = btn.getAttribute('data-sev-filter');
      document.querySelectorAll('[data-sev-filter]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      apply();
    });
  });

  apply();
})();
`;

  return { sections, body, widgets: [{ html: '', css: '', js: script }] };
}
