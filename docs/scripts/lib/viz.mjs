/**
 * The four visualizations.
 *
 * Colour follows the dataviz method: token tier and package layer are ORDERED
 * dimensions, so both use a single-hue sequential ramp (--seq-1..4) that is monotonic
 * in OKLCH lightness and therefore safe under every kind of colour blindness by
 * construction. Identity is never carried by colour alone — every node is labelled or
 * hover-labelled, and each graph ships a legend. The lightest ramp step falls under
 * 3:1 against the surface, so marks using it carry a stroke ring as relief.
 *
 * Layout is computed here at build time where it can be deterministic, and only
 * interaction happens in the browser. That keeps the pages static, diffable, and free
 * of a layout library.
 */
import { esc, jsStr } from './ui.mjs';

/* ============================================================================
   1. Token dependency graph
   ============================================================================ */

/**
 * All 109 real tokens as a node-link graph.
 *
 * Layout: tiers are columns (global → semantic → component, left to right, matching
 * the direction references flow), and within a column nodes are ordered by group so
 * related tokens sit together. A deterministic layered layout beats a force
 * simulation here — it makes the tier structure legible, which is the whole point,
 * and it produces the same picture every build.
 */
export function tokenGraph(data, { id = 'w-tokengraph', brand = null } = {}) {
  const which = brand ?? data.brands.default;
  const graph = data.graphs[which];

  // Tiers are horizontal BANDS, stacked component → semantic → global, matching the
  // tier-stack diagram used throughout the docs and the direction references flow.
  // Bands beat columns here: 53 component tokens in a column would be 660px tall and
  // mostly dead space, whereas a band packs them across the width in one readable row.
  const BAND_ORDER = ['component', 'semantic', 'global'];
  const nodes = [];
  const byPath = new Map();

  const bands = { global: [], semantic: [], component: [] };
  for (const [path, token] of Object.entries(graph)) {
    bands[token.tier]?.push({ path, ...token });
  }
  for (const tier of Object.keys(bands)) {
    // Sort by path so sibling tokens (button.*, input.*) sit next to each other.
    bands[tier].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  const W = 760;
  const PAD_X = 18;
  const BAND_H = 104;
  const TOP = 26;
  // Only the space the three bands actually occupy — the last band's nodes sit at
  // TOP + 2·BAND_H + 34, so anything past that plus a little air is dead space.
  const H = TOP + BAND_H * 2 + 34 + 24;
  const usable = W - PAD_X * 2;

  BAND_ORDER.forEach((tier, bandIndex) => {
    const list = bands[tier];
    const step = usable / Math.max(list.length - 1, 1);
    const y = TOP + bandIndex * BAND_H + 34;
    list.forEach((token, i) => {
      const node = {
        id: token.path,
        tier,
        // Nudge alternate nodes vertically so dense bands do not become one solid line
        // and adjacent hit targets stay separable.
        x: PAD_X + (list.length === 1 ? usable / 2 : i * step),
        y: y + (i % 2 ? 7 : -7),
        refs: token.references ?? [],
        resolved: typeof token.resolvedValue === 'string' ? token.resolvedValue : null,
        overridden: (data.brands.overrides[which] ?? []).includes(token.path),
        group: token.path.split('.')[0],
      };
      nodes.push(node);
      byPath.set(token.path, node);
    });
  });

  // Edges point from the referencing token to the token it references — the direction a
  // value travels as it resolves, and always downward through the bands.
  const edges = [];
  for (const node of nodes) {
    for (const ref of node.refs) {
      const target = byPath.get(ref);
      if (target) edges.push({ from: node.id, to: ref, x1: node.x, y1: node.y, x2: target.x, y2: target.y });
    }
  }

  const RAMP = { global: 'var(--seq-1)', semantic: 'var(--seq-2)', component: 'var(--seq-3)' };

  const edgeSvg = edges
    .map((e) => {
      // Vertical cubic: leaves the source downward, arrives at the target from above.
      const dy = (e.y2 - e.y1) * 0.55;
      return `<path class="gedge" data-from="${esc(e.from)}" data-to="${esc(e.to)}" d="M${e.x1.toFixed(1)},${e.y1.toFixed(1)} C${e.x1.toFixed(1)},${(e.y1 + dy).toFixed(1)} ${e.x2.toFixed(1)},${(e.y2 - dy).toFixed(1)} ${e.x2.toFixed(1)},${e.y2.toFixed(1)}"/>`;
    })
    .join('');

  const nodeSvg = nodes
    .map((n) => {
      const r = n.tier === 'global' ? 3.2 : n.tier === 'semantic' ? 3.6 : 4;
      // The lightest ramp step is under 3:1 on the surface, so it gets a ring.
      const ring = n.tier === 'global' ? ' stroke="var(--seq-1-ring)" stroke-width="1"' : '';
      const overridden = n.overridden ? ' data-overridden="true"' : '';
      return `<g class="gnode" data-id="${esc(n.id)}" data-tier="${n.tier}"${overridden} tabindex="0" role="listitem" aria-label="${esc(n.id)}">
        <circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${r}" fill="${RAMP[n.tier]}"${ring}/>
      </g>`;
    })
    .join('');

  // Band labels double as the tier legend: identity comes from position and a written
  // label, never from colour alone.
  const headers = BAND_ORDER.map((tier, i) => {
    const y = TOP + i * BAND_H + 6;
    const desc = { component: 'per-component decisions', semantic: 'named meanings', global: 'raw values' }[tier];
    return `<g>
        <line x1="${PAD_X}" y1="${(y + 6).toFixed(0)}" x2="${W - PAD_X}" y2="${(y + 6).toFixed(0)}" stroke="var(--rule)" stroke-width="1"/>
        <text x="${PAD_X}" y="${y.toFixed(0)}" style="font-size:9.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;fill:var(--text-muted)">${tier} · ${bands[tier].length}</text>
        <text x="${W - PAD_X}" y="${y.toFixed(0)}" text-anchor="end" style="font-size:9px;fill:var(--text-faint)">${desc}</text>
      </g>`;
  }).join('');

  const html = `<div class="widget wide" id="${id}">
  <header>
    <span class="wt">Every token, and what it points at</span>
    <span class="wh">${Object.keys(graph).length} real tokens · hover or focus a node to trace its chain</span>
  </header>
  <div class="body">
    <div class="legend" role="note">
      <span class="item"><span class="key ring" style="background:var(--seq-1)"></span>global — raw values</span>
      <span class="item"><span class="key" style="background:var(--seq-2)"></span>semantic — named meanings</span>
      <span class="item"><span class="key" style="background:var(--seq-3)"></span>component — per-component</span>
      <span class="item" style="margin-inline-start:auto">
        <span class="seg" role="group" aria-label="Brand">
          ${data.brands.all
            .map(
              (b, i) =>
                `<button type="button" data-tg-brand="${esc(b)}" aria-pressed="${i === 0 ? 'true' : 'false'}">${esc(b)}</button>`,
            )
            .join('')}
        </span>
      </span>
    </div>
    <div class="vizwrap viz">
      <svg class="graph" viewBox="0 0 ${W} ${H.toFixed(0)}" role="list" aria-label="Token dependency graph">
        ${headers}
        <g class="edges">${edgeSvg}</g>
        <g class="nodes">${nodeSvg}</g>
      </svg>
    </div>
    <div class="readout" data-tg-readout>
      <span style="color:var(--text-faint);font-size:var(--t-xs)">Hover a node. The lit path is what resolves when that token is used.</span>
    </div>
  </div>
</div>`;

  const js = `
(function () {
  var NODES = ${jsStr(
    Object.fromEntries(
      nodes.map((n) => [n.id, { tier: n.tier, refs: n.refs, overridden: n.overridden }]),
    ),
  )};
  var GRAPHS = ${jsStr(
    Object.fromEntries(
      Object.entries(data.graphs).map(([b, g]) => [
        b,
        Object.fromEntries(
          Object.entries(g).map(([p, t]) => [
            p,
            { resolved: typeof t.resolvedValue === 'string' ? t.resolvedValue : String(t.resolvedValue ?? ''), refs: t.references || [] },
          ]),
        ),
      ]),
    ),
  )};
  var OVERRIDES = ${jsStr(data.brands.overrides)};
  var root = document.getElementById(${jsStr(id)});
  if (!root) return;

  var svg = root.querySelector('svg.graph');
  var readout = root.querySelector('[data-tg-readout]');
  var brand = ${jsStr(data.brands.all[0])};

  /** Everything reachable downward from a token — the chain a value resolves through. */
  function chainFrom(startId) {
    var seen = {}, order = [], queue = [startId];
    while (queue.length) {
      var cur = queue.shift();
      if (seen[cur]) continue;
      seen[cur] = true;
      order.push(cur);
      (NODES[cur] ? NODES[cur].refs : []).forEach(function (r) { if (NODES[r] && !seen[r]) queue.push(r); });
    }
    return order;
  }

  /** Everything that points AT this token, transitively — its blast radius. */
  function dependents(startId) {
    var back = {};
    Object.keys(NODES).forEach(function (id) {
      NODES[id].refs.forEach(function (r) { (back[r] = back[r] || []).push(id); });
    });
    var seen = {}, out = [], queue = [startId];
    while (queue.length) {
      var cur = queue.shift();
      (back[cur] || []).forEach(function (d) {
        if (!seen[d]) { seen[d] = true; out.push(d); queue.push(d); }
      });
    }
    return out;
  }

  function clear() {
    svg.classList.remove('focused');
    svg.querySelectorAll('.lit, .root').forEach(function (el) { el.classList.remove('lit', 'root'); });
  }

  function focus(id) {
    clear();
    var chain = chainFrom(id);
    var inChain = {};
    chain.forEach(function (c) { inChain[c] = true; });
    svg.classList.add('focused');

    chain.forEach(function (c) {
      var n = svg.querySelector('.gnode[data-id="' + CSS.escape(c) + '"]');
      if (n) n.classList.add('lit');
    });
    var rootNode = svg.querySelector('.gnode[data-id="' + CSS.escape(id) + '"]');
    if (rootNode) rootNode.classList.add('root');

    svg.querySelectorAll('.gedge').forEach(function (e) {
      if (inChain[e.getAttribute('data-from')] && inChain[e.getAttribute('data-to')]) e.classList.add('lit');
    });

    var g = GRAPHS[brand] || {};
    var info = g[id] || {};
    var deps = dependents(id);
    var overridden = (OVERRIDES[brand] || []).filter(function (p) { return inChain[p]; });

    var isColor = /^(#|rgb|hsl)/i.test(info.resolved || '');
    readout.innerHTML =
      '<span class="rt">' + id + '</span>' +
      ' &nbsp;→&nbsp; ' +
      (isColor ? '<span class="swatch" style="background:' + info.resolved + '"></span>' : '') +
      '<b>' + (info.resolved || '(unresolved)') + '</b>' +
      '<span class="rd">' +
        'chain: ' + chain.join(' → ') +
      '</span>' +
      '<span class="rd">' +
        deps.length + ' token' + (deps.length === 1 ? '' : 's') + ' depend on this' +
        (deps.length ? ' — changing it moves ' + deps.slice(0, 4).join(', ') + (deps.length > 4 ? ' and ' + (deps.length - 4) + ' more' : '') : '') +
      '</span>' +
      (overridden.length
        ? '<span class="rd" style="color:var(--warn)">brand ' + brand + ' overrides ' + overridden.join(', ') + ' in this chain</span>'
        : '');
  }

  svg.querySelectorAll('.gnode').forEach(function (n) {
    var id = n.getAttribute('data-id');
    n.addEventListener('mouseenter', function () { focus(id); });
    n.addEventListener('focus', function () { focus(id); });
    n.addEventListener('click', function () { focus(id); });
  });
  svg.addEventListener('mouseleave', clear);

  root.querySelectorAll('[data-tg-brand]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      brand = btn.getAttribute('data-tg-brand');
      root.querySelectorAll('[data-tg-brand]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      // Re-mark which nodes this brand overrides.
      svg.querySelectorAll('.gnode').forEach(function (n) {
        var isOver = (OVERRIDES[brand] || []).indexOf(n.getAttribute('data-id')) !== -1;
        n.setAttribute('data-overridden', isOver ? 'true' : 'false');
      });
      clear();
      readout.innerHTML = '<span style="color:var(--text-faint);font-size:var(--t-xs)">Brand: <b>' + brand +
        '</b> — overrides ' + ((OVERRIDES[brand] || []).length) + ' token(s). Hover a node to trace a chain.</span>';
    });
  });
})();
`;

  const css = `
#${id} .gnode[data-overridden='true'] circle { stroke: var(--warn); stroke-width: 2; }
#${id} .readout { min-height: 5.5rem; }
`;

  return { html, css, js };
}

/* ============================================================================
   2. Tile → component mapping
   ============================================================================ */

/**
 * The central metaphor, in four states the reader steps through:
 *   tiles  — the five girih tiles, separate
 *   tess   — the same tiles fitted into a tessellation
 *   edges  — the strapwork lines that cross every edge at the same angle
 *   map    — each tile labelled as a component, the edge treatment as the token contract
 *
 * The five tiles are the real ones: decagon, pentagon, elongated hexagon, rhombus,
 * bowtie. Their vertices are computed from ten-fold symmetry.
 */
export function tileMapping({ id = 'w-tilemap' } = {}) {
  // Regular polygon helper, in a 0..100 box.
  const poly = (n, r, cx, cy, rot = -Math.PI / 2) =>
    Array.from({ length: n }, (_, i) => {
      const a = (Math.PI * 2 / n) * i + rot;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    });

  const fmt = (pts) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  const TILES = [
    { name: 'Decagon', component: 'Dialog', pts: poly(10, 30, 0, 0), note: 'the anchor — the biggest surface' },
    { name: 'Pentagon', component: 'Card', pts: poly(5, 24, 0, 0), note: 'fills between the anchors' },
    {
      name: 'Hexagon',
      component: 'Button',
      // Elongated hexagon: two half-decagon ends joined by a straight run.
      pts: [[-28, 0], [-14, -16], [14, -16], [28, 0], [14, 16], [-14, 16]],
      note: 'the workhorse',
    },
    { name: 'Rhombus', component: 'Badge', pts: [[-26, 0], [0, -14], [26, 0], [0, 14]], note: 'takes up the slack' },
    {
      name: 'Bowtie',
      component: 'Checkbox',
      pts: [[-24, -14], [0, -4], [24, -14], [24, 14], [0, 4], [-24, 14]],
      note: 'the awkward corners',
    },
  ];

  const W = 900;
  const H = 240;
  const slot = W / TILES.length;

  // Two layouts per tile: spread apart (tiles) and packed (tessellation).
  const spread = TILES.map((t, i) => ({ x: slot * (i + 0.5), y: H / 2 }));
  const packed = TILES.map((t, i) => ({ x: W / 2 + (i - 2) * 58, y: H / 2 + (i % 2 ? 26 : -26) }));

  const tileSvg = TILES.map((t, i) => {
    const pts = fmt(t.pts);
    // Strapwork: from each edge midpoint, a short line at a constant angle.
    const strap = t.pts
      .map((p, j) => {
        const q = t.pts[(j + 1) % t.pts.length];
        const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        // Point the line toward the centroid, scaled — the constant edge treatment.
        return `M${m[0].toFixed(1)},${m[1].toFixed(1)} L${(m[0] * 0.42).toFixed(1)},${(m[1] * 0.42).toFixed(1)}`;
      })
      .join(' ');

    return `<g class="tile" data-i="${i}"
        data-spread-x="${spread[i].x.toFixed(1)}" data-spread-y="${spread[i].y.toFixed(1)}"
        data-packed-x="${packed[i].x.toFixed(1)}" data-packed-y="${packed[i].y.toFixed(1)}"
        transform="translate(${spread[i].x.toFixed(1)},${spread[i].y.toFixed(1)})">
      <polygon class="tileshape" points="${pts}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.2"/>
      <path class="strapline" d="${strap}"/>
      <text class="tilelabel tname" y="-40">${esc(t.name)}</text>
      <text class="tilelabel tcomp" y="46" style="fill:var(--good);opacity:0">${esc(t.component)}</text>
    </g>`;
  }).join('');

  const html = `<div class="widget wide" id="${id}">
  <header>
    <span class="wt">One kit of tiles, endless patterns</span>
    <span class="wh">Step through the metaphor the project is named after</span>
  </header>
  <div class="body">
    <div class="controls" style="margin-bottom:0.85rem">
      <span class="seg" role="group" aria-label="Stage">
        <button type="button" data-tm="tiles" aria-pressed="true">1 · The kit</button>
        <button type="button" data-tm="tess" aria-pressed="false">2 · Assembled</button>
        <button type="button" data-tm="edges" aria-pressed="false">3 · Shared edges</button>
        <button type="button" data-tm="map" aria-pressed="false">4 · What it maps to</button>
      </span>
    </div>
    <div class="vizwrap viz tilestage" data-phase="tiles">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="The five girih tiles and what they correspond to">
        ${tileSvg}
      </svg>
    </div>
    <p data-tm-caption style="margin:0.85rem 0 0;font-size:calc(var(--t-base) * 0.95);color:var(--text-muted)"></p>
  </div>
</div>`;

  const CAPTIONS = {
    tiles:
      'Five tiles. A decagon, a pentagon, an elongated hexagon, a rhombus and a bowtie — that is the entire kit medieval craftsmen worked from.',
    tess:
      'Fitted together they tessellate. Nothing has been redrawn; the same five shapes are simply placed against each other.',
    edges:
      'Here is the trick. Every tile carries decorative lines that cross its edges at the same angle, at the same points. So when two tiles meet, the lines continue — and a pattern emerges that nobody drew directly.',
    map:
      'That is girih the tool. The tiles are your <b>component contracts</b>; the matched edge treatment is the <b>token contract</b> — every component referencing design values by name rather than baking them in. The endless variety of finished patterns is your <b>brands</b>.',
  };

  const js = `
(function () {
  var CAPTIONS = ${jsStr(CAPTIONS)};
  var root = document.getElementById(${jsStr(id)});
  if (!root) return;
  var stage = root.querySelector('.tilestage');
  var caption = root.querySelector('[data-tm-caption]');
  var tiles = Array.prototype.slice.call(root.querySelectorAll('.tile'));

  function go(phase) {
    stage.setAttribute('data-phase', phase);
    caption.innerHTML = CAPTIONS[phase] || '';
    root.querySelectorAll('[data-tm]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-tm') === phase));
    });

    var packed = phase !== 'tiles';
    tiles.forEach(function (t) {
      var x = t.getAttribute(packed ? 'data-packed-x' : 'data-spread-x');
      var y = t.getAttribute(packed ? 'data-packed-y' : 'data-spread-y');
      t.setAttribute('transform', 'translate(' + x + ',' + y + ')');

      var shape = t.querySelector('.tileshape');
      var comp = t.querySelector('.tcomp');
      var name = t.querySelector('.tname');
      if (phase === 'map') {
        shape.setAttribute('fill', 'var(--good-soft)');
        shape.setAttribute('stroke', 'var(--good)');
        comp.style.opacity = '1';
        name.style.opacity = '0.45';
      } else {
        shape.setAttribute('fill', 'var(--accent-soft)');
        shape.setAttribute('stroke', 'var(--accent)');
        comp.style.opacity = '0';
        name.style.opacity = '1';
      }
    });
  }

  root.querySelectorAll('[data-tm]').forEach(function (b) {
    b.addEventListener('click', function () { go(b.getAttribute('data-tm')); });
  });
  go('tiles');
})();
`;

  const css = `
#${id} .tile { transition: transform var(--dur-slow) var(--ease-in-out); }
#${id} .tilelabel { transition: opacity var(--dur-slow) var(--ease-out); }
#${id} svg { min-width: 640px; }
@media (prefers-reduced-motion: reduce) {
  #${id} .tile { transition: none; }
}
`;

  return { html, css, js };
}

/* ============================================================================
   3. Package dependency graph
   ============================================================================ */

/**
 * The nine packages, arranged by layer, with every real dependency drawn — and the
 * forbidden direction made explicit. Hovering a package shows what it may import and
 * what it may not, which is the rule the codebase relies on review to enforce.
 */
export function packageGraph({ id = 'w-pkggraph' } = {}) {
  // Layer index doubles as the sequential ramp step: an ordered dimension.
  const PKGS = [
    { name: '@girih/core', layer: 0, role: 'config · diagnostics · emitted files · naming', deps: [] },
    { name: '@girih/tokens', layer: 1, role: 'parse → merge → resolve → validate', deps: ['@girih/core'] },
    { name: '@girih/spec', layer: 2, role: 'contracts · IR · validation', deps: ['@girih/core', '@girih/tokens'] },
    { name: '@girih/generator-css', layer: 2, role: 'tokens → CSS + TokenPath', deps: ['@girih/core', '@girih/tokens'] },
    { name: '@girih/generator-react', layer: 3, role: 'IR + templates → React', deps: ['@girih/core', '@girih/spec'] },
    {
      name: '@girih/cli',
      layer: 4,
      role: 'the girih / ds binary',
      deps: ['@girih/core', '@girih/tokens', '@girih/spec', '@girih/generator-css', '@girih/generator-react'],
    },
    { name: '@girih/react-runtime', layer: 4, role: 'BrandProvider · useBrand · cx', deps: [], standalone: true },
    { name: 'create-girih', layer: 4, role: 'npx bootstrapper', deps: [], standalone: true },
    { name: '@girih/figma', layer: 4, role: 'phase-2 stub', deps: [], standalone: true },
  ];

  const W = 900;
  const LAYER_Y = [40, 120, 200, 280, 370];
  const H = 430;

  // Place packages within their layer, spread evenly.
  const byLayer = {};
  PKGS.forEach((p) => (byLayer[p.layer] = byLayer[p.layer] || []).push(p));
  const pos = new Map();
  Object.entries(byLayer).forEach(([layer, list]) => {
    const step = W / (list.length + 1);
    list.forEach((p, i) => pos.set(p.name, { x: step * (i + 1), y: LAYER_Y[Number(layer)] }));
  });

  const RAMP = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--warn)'];

  const edgeSvg = PKGS.flatMap((p) =>
    p.deps.map((dep) => {
      const a = pos.get(p.name);
      const b = pos.get(dep);
      const midY = (a.y + b.y) / 2;
      return `<path class="pedge" data-from="${esc(p.name)}" data-to="${esc(dep)}"
        d="M${a.x.toFixed(0)},${(a.y - 14).toFixed(0)} C${a.x.toFixed(0)},${midY.toFixed(0)} ${b.x.toFixed(0)},${midY.toFixed(0)} ${b.x.toFixed(0)},${(b.y + 14).toFixed(0)}"
        marker-end="url(#pkgarrow-${id})"/>`;
    }),
  ).join('');

  const nodeSvg = PKGS.map((p) => {
    const { x, y } = pos.get(p.name);
    const short = p.name.replace('@girih/', '');
    return `<g class="pnode" data-name="${esc(p.name)}" data-layer="${p.layer}" tabindex="0" role="listitem" aria-label="${esc(p.name)}: ${esc(p.role)}">
      <rect x="${(x - 74).toFixed(0)}" y="${(y - 14).toFixed(0)}" width="148" height="28" rx="4"
        fill="var(--bg-raised)" stroke="${RAMP[p.layer]}" stroke-width="${p.layer === 0 ? 2 : 1.5}"/>
      <text x="${x.toFixed(0)}" y="${(y + 4).toFixed(0)}" text-anchor="middle"
        style="font-family:var(--mono);font-size:11px;fill:var(--text)">${esc(short)}</text>
    </g>`;
  }).join('');

  const layerLabels = ['kernel', 'pipeline', 'generators + spec', 'react generator', 'surface']
    .map(
      (label, i) =>
        `<text x="8" y="${LAYER_Y[i] + 4}" style="font-size:9px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;fill:var(--text-faint)">${label}</text>`,
    )
    .join('');

  const html = `<div class="widget wide" id="${id}">
  <header>
    <span class="wt">The dependency direction</span>
    <span class="wh">Hover a package to see what it may — and may not — import</span>
  </header>
  <div class="body">
    <div class="legend" role="note">
      <span class="item"><span class="key ring" style="background:var(--seq-1)"></span>depth 0 — kernel</span>
      <span class="item"><span class="key" style="background:var(--seq-2)"></span>1</span>
      <span class="item"><span class="key" style="background:var(--seq-3)"></span>2</span>
      <span class="item"><span class="key" style="background:var(--seq-4)"></span>3</span>
      <span class="item"><span class="key" style="background:var(--warn)"></span>surface</span>
      <span class="item" style="color:var(--bad)">▲ an upward import is forbidden</span>
    </div>
    <div class="vizwrap viz">
      <svg class="pkggraph" viewBox="0 0 ${W} ${H}" role="list" aria-label="Package dependency graph">
        <defs>
          <marker id="pkgarrow-${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,1 L7,4 L0,7 Z" fill="var(--rule-strong)"/>
          </marker>
        </defs>
        ${layerLabels}
        <g class="pedges">${edgeSvg}</g>
        <g class="pnodes">${nodeSvg}</g>
      </svg>
    </div>
    <div class="readout" data-pg-readout>
      <span style="color:var(--text-faint);font-size:var(--t-xs)">Arrows point from a package to something it depends on. Nothing may point upward.</span>
    </div>
  </div>
</div>`;

  const js = `
(function () {
  var PKGS = ${jsStr(PKGS)};
  var root = document.getElementById(${jsStr(id)});
  if (!root) return;
  var svg = root.querySelector('svg.pkggraph');
  var readout = root.querySelector('[data-pg-readout]');
  var byName = {};
  PKGS.forEach(function (p) { byName[p.name] = p; });

  function clear() {
    svg.classList.remove('focused');
    svg.querySelectorAll('.lit, .forbidden, .root').forEach(function (el) {
      el.classList.remove('lit', 'forbidden', 'root');
    });
  }

  function focus(name) {
    clear();
    var p = byName[name];
    if (!p) return;
    svg.classList.add('focused');

    // Everything it may import: strictly lower layers (plus core).
    var allowed = PKGS.filter(function (q) { return q.layer < p.layer && !q.standalone; }).map(function (q) { return q.name; });
    var forbidden = PKGS.filter(function (q) { return q.layer >= p.layer && q.name !== name && !q.standalone; }).map(function (q) { return q.name; });

    svg.querySelector('.pnode[data-name="' + CSS.escape(name) + '"]').classList.add('root', 'lit');
    p.deps.forEach(function (d) {
      var n = svg.querySelector('.pnode[data-name="' + CSS.escape(d) + '"]');
      if (n) n.classList.add('lit');
    });
    svg.querySelectorAll('.pedge').forEach(function (e) {
      if (e.getAttribute('data-from') === name) e.classList.add('lit');
    });
    forbidden.forEach(function (f) {
      var n = svg.querySelector('.pnode[data-name="' + CSS.escape(f) + '"]');
      if (n) n.classList.add('forbidden');
    });

    readout.innerHTML =
      '<span class="rt">' + name + '</span> <span class="rd">' + p.role + '</span>' +
      '<span class="rd">' +
        (p.standalone
          ? 'standalone — depends on nothing in the workspace' +
            (name === 'create-girih' ? ', by necessity: it runs before anything is installed' : '')
          : (p.deps.length
              ? 'imports ' + p.deps.join(', ')
              : 'imports nothing in the workspace — it is the kernel')) +
      '</span>' +
      (!p.standalone && forbidden.length
        ? '<span class="rd" style="color:var(--bad)">may NOT import ' + forbidden.join(', ') +
          ' — that would be an upward import</span>'
        : '');
  }

  svg.querySelectorAll('.pnode').forEach(function (n) {
    var name = n.getAttribute('data-name');
    n.addEventListener('mouseenter', function () { focus(name); });
    n.addEventListener('focus', function () { focus(name); });
    n.addEventListener('click', function () { focus(name); });
  });
  svg.addEventListener('mouseleave', clear);
})();
`;

  const css = `
#${id} svg.pkggraph { min-width: 720px; }
#${id} .pedge { stroke: var(--rule-strong); stroke-width: 1.2; fill: none; transition: stroke var(--dur-fast) linear, opacity var(--dur-fast) linear; }
#${id} .pnode rect { transition: stroke-width var(--dur-fast) var(--ease-out), fill var(--dur-fast) var(--ease-out); }
#${id} .pnode { cursor: pointer; transition: opacity var(--dur-fast) linear; }
#${id} svg.focused .pnode { opacity: 0.3; }
#${id} svg.focused .pnode.lit { opacity: 1; }
#${id} svg.focused .pnode.forbidden { opacity: 0.85; }
#${id} .pnode.forbidden rect { stroke: var(--bad); stroke-dasharray: 3 2; fill: var(--bad-soft); }
#${id} .pnode.root rect { stroke-width: 2.5; fill: var(--accent-soft); }
#${id} svg.focused .pedge { opacity: 0.1; }
#${id} svg.focused .pedge.lit { opacity: 1; stroke: var(--accent); stroke-width: 1.8; }
#${id} .readout { min-height: 5rem; }
`;

  return { html, css, js };
}

/* ============================================================================
   4. Cascade resolution visualizer
   ============================================================================ */

/**
 * The hardest idea in girih, made pokeable: why a var() chain declared only in :root
 * ignores a nested [data-brand] scope.
 *
 * The reader chooses whether the brand block re-declares the dependents closure or
 * only the overridden token, and watches which declaration actually wins for
 * --ds-button-radius. The "closure off" case is the bug girih exists to prevent, and
 * the preview box shows the wrong corner radius arriving.
 */
export function cascadeViz({ id = 'w-cascade' } = {}) {
  const html = `<div class="widget" id="${id}">
  <header>
    <span class="wt">Which declaration wins?</span>
    <span class="wh">Why the dependents closure is not optional</span>
  </header>
  <div class="body">
    <div class="controls" style="margin-bottom:0.9rem">
      <span class="demolabel" style="min-width:auto">Brand block</span>
      <span class="seg" role="group" aria-label="Closure">
        <button type="button" data-cv-closure="on" aria-pressed="true">re-declares the closure</button>
        <button type="button" data-cv-closure="off" aria-pressed="false">only the override</button>
      </span>
      <span class="demolabel" style="min-width:auto;margin-inline-start:0.5rem">Nesting</span>
      <span class="seg" role="group" aria-label="Nesting">
        <button type="button" data-cv-nest="flat" aria-pressed="true">seller</button>
        <button type="button" data-cv-nest="nested" aria-pressed="false">seller › marketplace</button>
      </span>
    </div>

    <div class="cascade" data-cv-stack></div>

    <div class="resultbar" style="margin-top:0.85rem">
      <span class="previewbox" data-cv-preview></span>
      <span>
        <code>--ds-button-radius</code> resolves to <span class="big" data-cv-value>8px</span>
        <span class="verdicttext" data-cv-verdict></span>
      </span>
    </div>
  </div>
</div>`;

  const js = `
(function () {
  var root = document.getElementById(${jsStr(id)});
  if (!root) return;
  var stack = root.querySelector('[data-cv-stack]');
  var valueEl = root.querySelector('[data-cv-value]');
  var verdictEl = root.querySelector('[data-cv-verdict]');
  var preview = root.querySelector('[data-cv-preview]');

  var closure = 'on';
  var nest = 'flat';

  function decl(prop, value, state) {
    return '<span class="decl ' + (state || '') + '"><span>' + prop + '</span><span>' + value + '</span></span>';
  }

  function render() {
    // :root always declares the full chain.
    var rootDecls = [
      decl('--ds-radius-md', '8px', nest === 'flat' || closure === 'on' ? 'shadowed' : ''),
      decl('--ds-radius-control', 'var(--ds-radius-md)', closure === 'on' ? 'shadowed' : ''),
      decl('--ds-button-radius', 'var(--ds-radius-control)', closure === 'on' ? 'shadowed' : 'wins'),
    ];

    // The seller block: either the closure or just the override.
    var sellerDecls = closure === 'on'
      ? [
          decl('--ds-radius-md', '2px', 'wins'),
          decl('--ds-radius-control', 'var(--ds-radius-md)', 'wins'),
          decl('--ds-button-radius', 'var(--ds-radius-control)', nest === 'nested' ? 'shadowed' : 'wins'),
        ]
      : [
          decl('--ds-radius-md', '2px', 'wins'),
          '<span class="decl missing">--ds-radius-control  … not re-declared</span>',
          '<span class="decl missing">--ds-button-radius   … not re-declared</span>',
        ];

    var html =
      '<div class="scope" data-active="' + (closure === 'off' && nest === 'flat') + '">' +
        '<div class="sel">:root</div><div class="decls">' + rootDecls.join('') + '</div>' +
      '</div>' +
      '<div class="scope" data-active="' + (closure === 'on' && nest === 'flat') + '">' +
        '<div class="sel">[data-brand="seller"]</div><div class="decls">' + sellerDecls.join('') + '</div>' +
      '</div>';

    if (nest === 'nested') {
      // The default brand emits a block too, so nesting back to it restores base values.
      var mkDecls = [
        decl('--ds-radius-md', '8px', 'wins'),
        decl('--ds-radius-control', 'var(--ds-radius-md)', 'wins'),
        decl('--ds-button-radius', 'var(--ds-radius-control)', 'wins'),
      ];
      html +=
        '<div class="scope nested" data-active="true">' +
          '<div class="sel">[data-brand="marketplace"] &nbsp;<span style="color:var(--text-faint);font-weight:400">nested inside seller</span></div>' +
          '<div class="decls">' + mkDecls.join('') + '</div>' +
        '</div>';
    }

    stack.innerHTML = html;

    // What actually resolves.
    var value, verdict, tone;
    if (nest === 'nested') {
      value = '8px';
      verdict = 'The default brand emits its own block, so nesting back to marketplace restores the base chain. This is why a brand with no overrides still gets a scoped block.';
      tone = 'var(--good)';
    } else if (closure === 'on') {
      value = '2px';
      verdict = 'Correct. The brand block re-declares the whole chain, so every link recomputes inside this scope.';
      tone = 'var(--good)';
    } else {
      value = '8px';
      verdict = 'The bug. --ds-button-radius was computed in :root against :root\\u2019s --ds-radius-control, so the brand\\u2019s 2px is never consulted. Colour would appear to work while radius silently would not — a partial failure, the worst kind.';
      tone = 'var(--bad)';
    }

    valueEl.textContent = value;
    valueEl.style.color = tone;
    verdictEl.textContent = verdict;
    verdictEl.style.color = tone === 'var(--bad)' ? 'var(--bad)' : 'var(--text-muted)';
    preview.style.borderRadius = value;
    preview.style.borderColor = tone;
  }

  root.querySelectorAll('[data-cv-closure]').forEach(function (b) {
    b.addEventListener('click', function () {
      closure = b.getAttribute('data-cv-closure');
      root.querySelectorAll('[data-cv-closure]').forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      render();
    });
  });
  root.querySelectorAll('[data-cv-nest]').forEach(function (b) {
    b.addEventListener('click', function () {
      nest = b.getAttribute('data-cv-nest');
      root.querySelectorAll('[data-cv-nest]').forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      render();
    });
  });

  render();
})();
`;

  return { html, css: '', js };
}
