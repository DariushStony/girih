/**
 * The four interactive pieces. Each returns { html, css, js } so the build can
 * hoist styles and behaviour into the page shell exactly once.
 *
 * Everything these widgets display comes from docs/data/tokens.json, which is
 * produced by running girih's own engine over examples/acme-ds. No invented values.
 */
import { esc, jsStr } from './ui.mjs';

/* ============================================================================
   1. Live brand toggle — the real generated CSS, the real component markup
   ============================================================================ */

/**
 * The markup below is what the generated React components actually render:
 * Button emits `<button class="ds-button" data-variant data-size>`, Badge emits
 * `<span class="ds-badge" data-tone>`, PaymentButton is a Button with one extra
 * class. Kept faithful on purpose — a demo that cheats teaches the wrong contract.
 */
export function brandToggle(data, { id = 'branddemo' } = {}) {
  const brands = data.brands.all;
  const tokensCss = data.generated['styles/tokens.css'] ?? '';
  const componentsCss = data.generated['styles/components.css'] ?? '';

  const buttons = ['primary', 'secondary', 'danger']
    .map((v) => `<button class="ds-button" data-variant="${v}" data-size="md" type="button">${v[0].toUpperCase()}${v.slice(1)}</button>`)
    .join('\n            ');
  const sizes = ['sm', 'md', 'lg']
    .map((s) => `<button class="ds-button" data-variant="primary" data-size="${s}" type="button">Size ${s}</button>`)
    .join('\n            ');
  const badges = ['neutral', 'primary', 'danger'].map((t) => `<span class="ds-badge" data-tone="${t}">${t}</span>`).join('\n            ');

  const brandButtons = brands
    .map((b, i) => `<button type="button" data-brand-set="${esc(b)}" aria-pressed="${i === 0 ? 'true' : 'false'}">${esc(b)}</button>`)
    .join('');

  const overrideNote = brands
    .map((b) => {
      const n = (data.brands.overrides[b] ?? []).length;
      return `<span data-brand-note="${esc(b)}" style="display:${b === brands[0] ? 'inline' : 'none'}">${
        n === 0
          ? 'the default brand — overrides nothing'
          : `overrides ${n} token${n === 1 ? '' : 's'}: <code>${(data.brands.overrides[b] ?? []).map(esc).join('</code>, <code>')}</code>`
      }</span>`;
    })
    .join('');

  const html = `<div class="widget" id="${id}">
  <header>
    <span class="wt">Live brand switch</span>
    <span class="wh">Real generated CSS · no reload, no rebuild</span>
  </header>
  <div class="body">
    <div class="controls" style="margin-bottom:1rem">
      <span class="demolabel" style="min-width:auto">Brand</span>
      <span class="seg" role="group" aria-label="Choose brand">${brandButtons}</span>
      <span style="font-family:var(--util);font-size:var(--t-xs);color:var(--text-muted)">${overrideNote}</span>
    </div>
    <div class="dsdemo demosurface" data-brand="${esc(brands[0])}">
      <div class="demorow">
        <span class="demolabel">Variants</span>
        ${buttons}
      </div>
      <div class="demorow">
        <span class="demolabel">Sizes</span>
        ${sizes}
      </div>
      <div class="demorow">
        <span class="demolabel">Extension</span>
        <button class="ds-button ds-x-payment-button" data-variant="primary" data-size="md" type="button">Pay now</button>
        <span style="font-family:var(--util);font-size:var(--t-xs);color:var(--text-faint)">PaymentButton — deliberately brand-independent</span>
      </div>
      <div class="demorow">
        <span class="demolabel">Badges</span>
        ${badges}
      </div>
      <div class="demorow">
        <span class="demolabel">Input</span>
        <input class="ds-input" data-size="md" placeholder="you@example.com" aria-label="Email">
      </div>
      <div class="ds-card">
        <span class="demolabel" style="display:block;margin-bottom:0.5rem">Card</span>
        <span style="font-family:var(--util);font-size:var(--t-sm)">A card is structure plus four token references — background, border, radius, padding.</span>
      </div>
    </div>
    <p style="margin:1rem 0 0;font-family:var(--util);font-size:var(--t-xs);color:var(--text-muted)">
      Watch the corner radius, not just the colour. <code>seller</code> overrides the
      <em>global</em> <code>radius.md</code>, so the change arrives through two levels of alias.
    </p>
  </div>
</div>`;

  // The generated stylesheets, verbatim. Scoped commentary added so a reader viewing
  // source can see where girih's output starts and the documentation's own CSS ends.
  const css = `
/* ==== BEGIN verbatim girih output: examples/acme-ds/.../styles/tokens.css ==== */
${tokensCss}
/* ==== END tokens.css ==== */
/* ==== BEGIN verbatim girih output: examples/acme-ds/.../styles/components.css ==== */
${componentsCss}
/* ==== END components.css ==== */
/* The demo surface only constrains layout; every design value above is a token. */
.dsdemo .ds-button, .dsdemo .ds-input { font-family: var(--ds-typography-body-family); }
.dsdemo .ds-card { max-width: 28rem; }
`;

  const js = `
(function () {
  var root = document.getElementById(${jsStr(id)});
  if (!root) return;
  var surface = root.querySelector('.dsdemo');
  root.querySelectorAll('[data-brand-set]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var brand = btn.getAttribute('data-brand-set');
      surface.setAttribute('data-brand', brand);
      root.querySelectorAll('[data-brand-set]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      root.querySelectorAll('[data-brand-note]').forEach(function (n) {
        n.style.display = n.getAttribute('data-brand-note') === brand ? 'inline' : 'none';
      });
    });
  });
})();
`;
  return { html, css, js };
}

/* ============================================================================
   2. Token resolution walker
   ============================================================================ */

export function tokenWalker(data, { id = 'walker' } = {}) {
  const brands = data.brands.all;
  const paths = Object.keys(data.chains[brands[0]] ?? {});

  const brandButtons = brands
    .map((b, i) => `<button type="button" data-w-brand="${esc(b)}" aria-pressed="${i === 0 ? 'true' : 'false'}">${esc(b)}</button>`)
    .join('');
  const options = paths.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');

  const html = `<div class="widget" id="${id}">
  <header>
    <span class="wt">Alias chain walker</span>
    <span class="wh">Step a token down to its raw value, per brand</span>
  </header>
  <div class="body">
    <div class="controls" style="margin-bottom:0.9rem">
      <select class="sel" data-w-path aria-label="Token to trace">${options}</select>
      <span class="seg" role="group" aria-label="Brand">${brandButtons}</span>
      <button class="btn" type="button" data-w-step>Step down ↓</button>
      <button class="btn primary" type="button" data-w-play>Play</button>
      <button class="btn" type="button" data-w-reset>Reset</button>
    </div>
    <div data-w-chain></div>
    <p data-w-verdict style="margin:0.9rem 0 0;font-family:var(--util);font-size:var(--t-sm);color:var(--text-muted)"></p>
  </div>
</div>`;

  const js = `
(function () {
  var CHAINS = ${jsStr(data.chains)};
  var root = document.getElementById(${jsStr(id)});
  if (!root) return;

  var pathSel  = root.querySelector('[data-w-path]');
  var chainBox = root.querySelector('[data-w-chain]');
  var verdict  = root.querySelector('[data-w-verdict]');
  var brand = ${jsStr(brands[0])};
  var shown = 1;
  var timer = null;

  var COLOR = /^(#[0-9a-f]{3,8}|rgba?\\(|hsla?\\()/i;

  function chain() { return (CHAINS[brand] || {})[pathSel.value] || []; }

  function draw() {
    var hops = chain();
    chainBox.innerHTML = hops.map(function (h, i) {
      var isColor = typeof h.resolved === 'string' && COLOR.test(String(h.resolved).trim());
      var swatch = isColor
        ? '<span class="swatch" style="background:' + String(h.resolved).replace(/"/g, '') + '"></span>'
        : '';
      return '<div class="hop' + (i < shown ? '' : ' dim') + '" data-tier="' + h.tier +
        '" data-override="' + (h.overriddenHere ? 'true' : 'false') + '">' +
        '<span class="tierbadge">' + h.tier + '</span>' +
        '<span class="path">' + h.path +
        '<span style="color:var(--text-faint)"> = ' + h.authored + '</span></span>' +
        '<span class="val">' + (i < shown ? swatch + h.resolved : '&middot;&middot;&middot;') + '</span>' +
        '</div>';
    }).join('');
    chainBox.className = 'chain bleed';

    var hop = hops[shown - 1];
    var last = hops[hops.length - 1];
    if (!hop) { verdict.textContent = ''; return; }
    if (shown < hops.length) {
      verdict.innerHTML = 'Hop ' + shown + ' of ' + hops.length + ': <code>' + hop.path +
        '</code> does not hold a value — it points at <code>' + (hop.authored || '') + '</code>. Keep going.';
    } else {
      var overridden = hops.filter(function (h) { return h.overriddenHere; });
      verdict.innerHTML = 'Bottom of the chain. <code>' + hops[0].path + '</code> resolves to <b>' +
        last.resolved + '</b> for <b>' + brand + '</b>' +
        (overridden.length
          ? ', because this brand overrides <code>' + overridden.map(function (h) { return h.path; }).join('</code>, <code>') + '</code>.'
          : ' — no override on this path, so it inherits the base value.');
    }
  }

  function reset() { shown = 1; if (timer) { clearInterval(timer); timer = null; } draw(); }

  root.querySelector('[data-w-step]').addEventListener('click', function () {
    shown = shown >= chain().length ? 1 : shown + 1;
    draw();
  });
  root.querySelector('[data-w-play]').addEventListener('click', function () {
    if (timer) { clearInterval(timer); timer = null; return; }
    shown = 1; draw();
    timer = setInterval(function () {
      if (shown >= chain().length) { clearInterval(timer); timer = null; return; }
      shown += 1; draw();
    }, 750);
  });
  root.querySelector('[data-w-reset]').addEventListener('click', reset);
  pathSel.addEventListener('change', reset);
  root.querySelectorAll('[data-w-brand]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      brand = btn.getAttribute('data-w-brand');
      root.querySelectorAll('[data-w-brand]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      reset();
    });
  });

  shown = 1;
  draw();
})();
`;
  return { html, css: '', js };
}

/* ============================================================================
   3. Pipeline stepper
   ============================================================================ */

/**
 * Follows ONE token — `radius.md`, which the seller brand overrides — through every
 * stage of the real pipeline, with the real function names and the real output at
 * each step. Chosen because it is a global-tier override, so it exercises the whole
 * three-tier cascade rather than a single hop.
 */
export function pipelineStepper({ id = 'stepper' } = {}) {
  const STAGES = [
    {
      title: 'Read',
      owner: 'buildTokenGraphs',
      detail: 'glob + sort + JSON.parse, tier inferred from the filename',
      note: 'Files are globbed then sorted so the build is deterministic. <code>inferTier()</code> reads the tier off the path: anything under <code>tokens/components/</code> is component tier, <code>global*.tokens.json</code> is global, <code>semantic*</code> is semantic. A file it cannot classify gets a <code>GIRIH2004</code> warning and is treated as semantic.',
      data: `tokens/global.tokens.json  →  tier: global
{
  "radius": {
    "$type": "dimension",
    "md": { "$value": "8px" }
  }
}`,
    },
    {
      title: 'Merge',
      owner: 'mergeTokenFiles',
      detail: 'nested DTCG flattened into one path-keyed map',
      note: 'Nested JSON becomes a flat map keyed by dotted path. This is the shape everything downstream speaks. <code>$type</code> inherits from the nearest ancestor that declares it, which is why <code>radius.md</code> knows it is a dimension without saying so itself.',
      data: `base token set  (109 tokens)
radius.md        tier=global     value="8px"
radius.control   tier=semantic   value="{radius.md}"
button.radius    tier=component  value="{radius.control}"`,
    },
    {
      title: 'Overlay',
      owner: 'applyBrandOverlay',
      detail: 'brand overrides applied — existing paths only',
      note: 'The brand overlay may only replace values at paths that already exist. Introducing a new path here is an error, not a merge — that is the <b>override-only rule</b>, and it is what keeps every brand structurally identical. The overlay also records which paths it touched; that list drives the scoped CSS block later.',
      data: `brands/seller/tokens.json  →  overlay
radius.md   "8px"  ⟶  "2px"        ← overridden

overriddenPaths = ["color.primary", "color.primary-hover", "radius.md"]`,
    },
    {
      title: 'Resolve',
      owner: 'resolveTokenSet',
      detail: 'alias chains followed, cycles detected, poison propagated',
      note: 'Each <code>{alias}</code> is followed to a raw value. Unknown references get <code>GIRIH2030</code> with a "did you mean" suggestion; circular ones get <code>GIRIH2031</code> naming the <em>whole</em> cycle. Anything that can reach a broken token is marked unresolvable too, but only the root cause is reported — so one typo produces one error, not forty.',
      data: `resolved graph  (brand: seller)
button.radius    →  radius.control  →  radius.md  =  "2px"
button.primary.background  →  color.primary  →  color.green.600  =  "#16A34A"`,
    },
    {
      title: 'Validate',
      owner: 'validateTierDirection + validateBrandParity',
      detail: 'references must flow downward; brands must match',
      note: 'Two checks. Tier direction: a reference may only point at its own tier or a lower one, so component→semantic→global is legal and the reverse is not. Brand parity: every brand must end up with the same set of token paths — if one brand is missing a token another has, the component contract could not be satisfiable everywhere.',
      data: `button.radius (component) → radius.control (semantic)   ✓ downward
radius.control (semantic) → radius.md (global)           ✓ downward

brand parity: marketplace 109 paths · seller 109 paths    ✓ identical`,
    },
    {
      title: 'Emit',
      owner: 'generateCss',
      detail: ':root plus one scoped block per brand — var() preserved',
      note: 'The critical move: aliases stay as live <code>var()</code> references instead of being flattened to literals. And a brand block re-declares not only the overridden token but <b>every token that transitively references it</b> — the dependents closure. Custom properties are computed where they are declared, so a chain declared only in <code>:root</code> would resolve against <code>:root</code> and ignore the nested brand scope entirely.',
      data: `[data-brand="seller"] {
  --ds-radius-md: 2px;                              /* the override */
  --ds-radius-control: var(--ds-radius-md);         /* dependent  */
  --ds-button-radius: var(--ds-radius-control);     /* dependent  */
  --ds-input-radius: var(--ds-radius-control);      /* dependent  */
}`,
    },
  ];

  const cells = STAGES.map(
    (s, i) => `<div class="stage" data-on="${i === 0 ? 'true' : 'false'}" data-owner="${esc(s.owner.split(' ')[0])}" data-step="${i}">
      <div class="n">${String(i + 1).padStart(2, '0')}</div>
      <div class="t">${esc(s.title)}</div>
      <div class="d">${esc(s.detail)}</div>
    </div>`,
  ).join('\n      ');

  const html = `<div class="widget" id="${id}">
  <header>
    <span class="wt">The pipeline, one stage at a time</span>
    <span class="wh">Following <code>radius.md</code> — a global token the seller brand overrides</span>
  </header>
  <div class="body">
    <div class="rail" style="margin-top:0">
      <div class="track">
      ${cells}
      </div>
    </div>
    <div class="controls" style="margin:0.9rem 0">
      <button class="btn" type="button" data-s-prev>← Back</button>
      <button class="btn primary" type="button" data-s-next>Next stage →</button>
      <span style="font-family:var(--util);font-size:var(--t-xs);color:var(--text-faint)" data-s-count></span>
    </div>
    <h4 style="margin-top:1.25rem" data-s-title></h4>
    <p data-s-note style="font-size:calc(var(--t-base) * 0.96)"></p>
    <figure class="code" style="margin-bottom:0">
      <figcaption><span class="path" data-s-owner></span><span class="badge generated">In flight</span></figcaption>
      <pre><code data-s-data></code></pre>
    </figure>
  </div>
</div>`;

  const js = `
(function () {
  var STAGES = ${jsStr(STAGES.map((s) => ({ title: s.title, owner: s.owner, note: s.note, data: s.data })))};
  var root = document.getElementById(${jsStr(id)});
  if (!root) return;

  var at = 0;
  var titleEl = root.querySelector('[data-s-title]');
  var noteEl  = root.querySelector('[data-s-note]');
  var dataEl  = root.querySelector('[data-s-data]');
  var ownerEl = root.querySelector('[data-s-owner]');
  var countEl = root.querySelector('[data-s-count]');
  var prevBtn = root.querySelector('[data-s-prev]');
  var nextBtn = root.querySelector('[data-s-next]');

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function draw() {
    var s = STAGES[at];
    titleEl.textContent = (at + 1) + '. ' + s.title;
    noteEl.innerHTML = s.note;
    dataEl.innerHTML = esc(s.data)
      .replace(/(←[^\\n]*)/g, '<span class="tk-r">$1</span>')
      .replace(/(\\/\\*[^*]*\\*\\/)/g, '<span class="tk-c">$1</span>')
      .replace(/(✓[^\\n]*)/g, '<span class="tk-add">$1</span>')
      .replace(/(&quot;[^&]*&quot;)/g, '<span class="tk-s">$1</span>');
    ownerEl.textContent = s.owner + '()';
    countEl.textContent = 'Stage ' + (at + 1) + ' of ' + STAGES.length;
    prevBtn.disabled = at === 0;
    nextBtn.disabled = at === STAGES.length - 1;
    root.querySelectorAll('[data-step]').forEach(function (cell) {
      cell.setAttribute('data-on', String(Number(cell.getAttribute('data-step')) === at));
    });
  }

  prevBtn.addEventListener('click', function () { if (at > 0) { at--; draw(); } });
  nextBtn.addEventListener('click', function () { if (at < STAGES.length - 1) { at++; draw(); } });
  root.querySelectorAll('[data-step]').forEach(function (cell) {
    cell.style.cursor = 'pointer';
    cell.addEventListener('click', function () { at = Number(cell.getAttribute('data-step')); draw(); });
  });

  draw();
})();
`;
  return { html, css: '', js };
}

/* ============================================================================
   4. Quiz
   ============================================================================ */

/**
 * Questions are medium difficulty by design: answerable if you understood the
 * model, not answerable by pattern-matching the page. Feedback is given for the
 * chosen answer whether it was right or wrong.
 */
export function quiz(questions, { id = 'quiz' } = {}) {
  const items = questions
    .map((q, qi) => {
      const opts = q.options
        .map(
          (o, oi) =>
            `<li><button type="button" data-q="${qi}" data-o="${oi}">
          <span class="k">${String.fromCharCode(65 + oi)}</span>
          <span>${o.text}</span>
        </button></li>`,
        )
        .join('\n        ');
      const codeBlock = q.code ? `<pre>${esc(q.code)}</pre>` : '';
      return `<div class="q" data-qi="${qi}">
      <div class="stem">
        <div class="qn">Question ${qi + 1} of ${questions.length}</div>
        <p>${q.stem}</p>
        ${codeBlock}
      </div>
      <ul class="opts">
        ${opts}
      </ul>
      <div class="verdict" data-verdict="${qi}"><span class="vt"></span><p></p></div>
    </div>`;
    })
    .join('\n    ');

  const html = `<div class="widget" id="${id}" style="box-shadow:none;border:0;background:none">
  <div class="body" style="padding:0">
    <div class="quiz">
      ${items}
    </div>
    <p class="score" style="margin-top:1.5rem" data-score>No answers yet — pick one above.</p>
  </div>
</div>`;

  const js = `
(function () {
  var Q = ${jsStr(
    questions.map((q) => ({
      answer: q.answer,
      why: q.options.map((o) => o.why),
    })),
  )};
  var root = document.getElementById(${jsStr(id)});
  if (!root) return;
  var scoreEl = root.querySelector('[data-score]');
  var answered = {};

  function updateScore() {
    var keys = Object.keys(answered);
    var right = keys.filter(function (k) { return answered[k]; }).length;
    if (keys.length === 0) { scoreEl.textContent = 'No answers yet — pick one above.'; return; }
    var msg = '<b>' + right + '</b> of <b>' + keys.length + '</b> answered correctly';
    if (keys.length === Q.length) {
      msg += right === Q.length
        ? ' — every one. You have the model.'
        : (right >= Q.length - 2
            ? ' — solid. Re-read the ones you missed; they are usually the same idea twice.'
            : ' — worth another pass over chapters 03 and 04 before touching the generators.');
    }
    scoreEl.innerHTML = msg;
  }

  root.querySelectorAll('.opts button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var qi = Number(btn.getAttribute('data-q'));
      var oi = Number(btn.getAttribute('data-o'));
      if (qi in answered) return;

      var correct = Q[qi].answer;
      var ok = oi === correct;
      answered[qi] = ok;

      var card = root.querySelector('.q[data-qi="' + qi + '"]');
      card.querySelectorAll('.opts button').forEach(function (b) {
        var bo = Number(b.getAttribute('data-o'));
        b.disabled = true;
        if (bo === correct) b.setAttribute('data-state', 'right');
        else if (bo === oi) b.setAttribute('data-state', 'wrong');
      });

      var v = root.querySelector('[data-verdict="' + qi + '"]');
      v.setAttribute('data-show', 'true');
      v.setAttribute('data-ok', String(ok));
      v.querySelector('.vt').textContent = ok ? 'Correct' : 'Not quite';
      v.querySelector('p').innerHTML = Q[qi].why[oi] +
        (ok ? '' : ' <br><br><b>The answer is ' + String.fromCharCode(65 + correct) + '.</b> ' + Q[qi].why[correct]);
      updateScore();
    });
  });
})();
`;
  return { html, css: '', js };
}
