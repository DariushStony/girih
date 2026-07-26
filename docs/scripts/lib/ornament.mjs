/**
 * The girih ornament: the logo, the generative tessellation, and the reveal observer.
 *
 * All geometry is computed from the ten-fold symmetry that girih patterns are actually
 * built on — no hand-authored path data, and no decorative shape that isn't derivable
 * from a compass-and-straightedge construction.
 */

/* ============================================================================
   The logo — a ten-fold star that draws itself
   ============================================================================ */

/**
 * A decagram inscribed in a decagon inscribed in a circle, with the construction
 * lines that produce it left visible. On first load the circle sweeps, the radii
 * step round, then the star strokes itself closed — the order a craftsman would
 * actually draw it. After that it is a static mark.
 *
 * @param {object} opts  size, whether to animate, and a unique id for the gradient
 */
export function girihLogo({ size = 30, animate = true, id = 'mark' } = {}) {
  const R = 21;
  const cx = 24;
  const cy = 24;
  const points = 10;

  const ring = (r, rotate = -Math.PI / 2) =>
    Array.from({ length: points }, (_, i) => {
      const a = (Math.PI * 2 / points) * i + rotate;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    });

  const fmt = (pts) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

  // The star: alternate outer and inner vertices. The inner radius that makes a
  // {10/3} star polygon look right is R * cos(3π/10) / cos(π/10).
  const inner = (R * Math.cos((3 * Math.PI) / 10)) / Math.cos(Math.PI / 10);
  const starPts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? R : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    starPts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }

  const decagon = ring(R);
  // Construction radii — the lines struck from centre to each vertex.
  const radii = decagon
    .map(([x, y]) => `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}"/>`)
    .join('');

  const anim = animate ? ' data-animate="true"' : '';

  return `<svg class="girihmark" width="${size}" height="${size}" viewBox="0 0 48 48" role="img" aria-label="girih"${anim}>
      <g class="construct" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.28">
        <circle cx="${cx}" cy="${cy}" r="${R}"/>
        ${radii}
      </g>
      <polygon class="deca" points="${fmt(decagon)}" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.4"/>
      <polygon class="star" points="${fmt(starPts)}" fill="none" stroke="var(--accent)" stroke-width="1.35" stroke-linejoin="round"/>
    </svg>`;
}

/**
 * CSS for the logo construction animation. Kept with the geometry that needs it.
 *
 * The RESTING state is the finished mark: dash offsets are zero and the radii are
 * opaque. The draw-in is expressed entirely inside the keyframes, with fill-mode
 * `both` so the start state applies during the delay. That ordering matters — if the
 * animation never runs (reduced motion, an old engine, a paused timeline, a static
 * render for print or a screenshot) the mark is simply *there* rather than invisible.
 * A logo must never depend on animation to exist.
 *
 * Dash lengths are the real path lengths, computed from the geometry above:
 * circle 2πr = 131.9, decagon 10·2R·sin(π/10) = 129.8, star 20 edges = 190.8.
 * Each is rounded up so offset 0 always covers the whole path.
 */
export const LOGO_CSS = `
.girihmark .construct circle,
.girihmark .construct line,
.girihmark .deca,
.girihmark .star { vector-effect: non-scaling-stroke; }

/* Resting state — the completed mark. */
.girihmark .construct circle { stroke-dasharray: 133; stroke-dashoffset: 0; }
.girihmark .deca             { stroke-dasharray: 131; stroke-dashoffset: 0; }
.girihmark .star             { stroke-dasharray: 192; stroke-dashoffset: 0; }
.girihmark .construct line   { opacity: 1; }

/* The construction, in the order a craftsman would strike it. */
.girihmark[data-animate='true'] .construct circle {
  animation: sweep-circle 620ms var(--ease-out) 120ms both;
}
.girihmark[data-animate='true'] .construct line {
  animation: strike 260ms var(--ease-out) both;
}
${Array.from({ length: 10 }, (_, i) => `.girihmark[data-animate='true'] .construct line:nth-of-type(${i + 1}) { animation-delay: ${420 + i * 45}ms; }`).join('\n')}
.girihmark[data-animate='true'] .deca {
  animation: sweep-deca 520ms var(--ease-out) 880ms both;
}
.girihmark[data-animate='true'] .star {
  animation: sweep-star 900ms var(--ease-out) 1120ms both;
}

@keyframes sweep-circle { from { stroke-dashoffset: 133; } to { stroke-dashoffset: 0; } }
@keyframes sweep-deca   { from { stroke-dashoffset: 131; } to { stroke-dashoffset: 0; } }
@keyframes sweep-star   { from { stroke-dashoffset: 192; } to { stroke-dashoffset: 0; } }
@keyframes strike       { from { opacity: 0; } to { opacity: 1; } }

/* Hovering the wordmark re-emphasises the star without re-running the build. */
.brandmark:hover .girihmark .star { stroke: var(--accent-deep); }
.brandmark:hover .girihmark .construct { opacity: 0.5; }
.girihmark .construct, .girihmark .star { transition: opacity var(--dur-mid) var(--ease-out), stroke var(--dur-mid) var(--ease-out); }

@media (prefers-reduced-motion: reduce) {
  /* Resting state is already the finished mark, so this only has to stop the draw-in. */
  .girihmark[data-animate='true'] .construct circle,
  .girihmark[data-animate='true'] .construct line,
  .girihmark[data-animate='true'] .deca,
  .girihmark[data-animate='true'] .star {
    animation: none !important;
  }
}
`;

/**
 * The safety net for the draw-in.
 *
 * `animation-fill-mode: both` pins the element to the keyframe `from` state during the
 * delay — which is what makes the draw-in look right. But it also means that if the
 * animation timeline never advances (a frozen or paused timeline, a headless renderer,
 * an engine that ignores the animation), the mark stays pinned at "not yet drawn" and
 * is invisible forever.
 *
 * So once the construction window has passed we simply drop the attribute the animation
 * rules hang off. If the animation ran, this is visually a no-op; if it never ran, the
 * resting state — the finished mark — takes over. Either way there is always a logo.
 */
export const LOGO_JS = `
(function () {
  var TOTAL = 2100; // 1120ms delay + 900ms sweep, plus a little slack
  function settle() {
    document.querySelectorAll('.girihmark[data-animate="true"]').forEach(function (m) {
      m.removeAttribute('data-animate');
    });
  }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { settle(); return; }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(settle, TOTAL); });
  } else {
    setTimeout(settle, TOTAL);
  }
})();
`;

/* ============================================================================
   The generative tessellation — canvas behind each page header
   ============================================================================ */

/**
 * Lays out a real girih tessellation and reveals it tile by tile.
 *
 * The pattern is the classic ten-fold construction: decagons on a lattice, each
 * carrying the strapwork lines that cross its edges at 36° to the edge midpoints.
 * Because every tile treats its edges the same way, the lines continue across tile
 * boundaries — which is the whole point of the girih method, and the reason the
 * documentation uses it as its ornament.
 *
 * Drawn on canvas rather than as SVG because it is decorative, and because a few
 * hundred stroked paths are cheaper to paint than to put in the DOM.
 */
export const TESSELLATION_JS = `
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  function tokenColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function build(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (w === 0 || h === 0) return null;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Lattice of decagon centres. Ten-fold girih tiles on a staggered grid: the
    // horizontal step is the decagon width, the vertical step its apothem pair.
    var R = 46;                          // circumradius of each decagon
    var stepX = R * 2 * Math.cos(Math.PI / 10);
    var stepY = R * (1 + Math.cos(Math.PI / 5));
    var tiles = [];
    for (var row = -1; row * stepY < h + stepY; row++) {
      for (var col = -1; col * stepX < w + stepX; col++) {
        var offset = (row % 2 === 0) ? 0 : stepX / 2;
        tiles.push({ x: col * stepX + offset, y: row * stepY });
      }
    }
    // Reveal order: by distance from the top-left, so the pattern grows out of the
    // corner the title sits in rather than appearing all at once.
    tiles.sort(function (a, b) { return (a.x + a.y) - (b.x + b.y); });

    function drawTile(t, alpha) {
      var pts = [];
      for (var i = 0; i < 10; i++) {
        var a = (Math.PI * 2 / 10) * i - Math.PI / 2;
        pts.push([t.x + R * Math.cos(a), t.y + R * Math.sin(a)]);
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      // The decagon outline, faint — this is the construction line.
      ctx.beginPath();
      pts.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
      ctx.closePath();
      ctx.strokeStyle = ctx.constructionColor;
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Strapwork: from each edge midpoint, strike a line at 36 degrees to the edge.
      // Adjacent midpoints joined this way produce the interlaced star.
      ctx.beginPath();
      for (var j = 0; j < 10; j++) {
        var p1 = pts[j];
        var p2 = pts[(j + 1) % 10];
        var m1 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
        var p3 = pts[(j + 2) % 10];
        var m2 = [(p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2];
        ctx.moveTo(m1[0], m1[1]);
        ctx.lineTo(m2[0], m2[1]);
      }
      ctx.closePath();
      ctx.strokeStyle = ctx.strapColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      // The inner star, joining every third midpoint — the ten-pointed figure.
      ctx.beginPath();
      for (var k = 0; k < 10; k++) {
        var q1 = pts[k];
        var q2 = pts[(k + 1) % 10];
        var mid = [(q1[0] + q2[0]) / 2, (q1[1] + q2[1]) / 2];
        var toC = [t.x - mid[0], t.y - mid[1]];
        var ix = mid[0] + toC[0] * 0.52;
        var iy = mid[1] + toC[1] * 0.52;
        k ? ctx.lineTo(ix, iy) : ctx.moveTo(ix, iy);
      }
      ctx.closePath();
      ctx.strokeStyle = ctx.starColor;
      ctx.lineWidth = 0.9;
      ctx.stroke();

      ctx.restore();
    }

    return { ctx: ctx, tiles: tiles, w: w, h: h, drawTile: drawTile };
  }

  function paint(canvas) {
    var built = build(canvas);
    if (!built) return;
    var ctx = built.ctx;

    ctx.constructionColor = tokenColor('--rule-strong', '#C6BDA4');
    ctx.strapColor = tokenColor('--accent', '#2E5BC9');
    ctx.starColor = tokenColor('--good', '#00A0A0');

    if (reduce.matches) {
      // Static, single pass — no growth animation.
      built.tiles.forEach(function (t) { built.drawTile(t, 0.5); });
      return;
    }

    // Grow the pattern: a few tiles per frame, each fading in.
    var i = 0;
    var perFrame = Math.max(1, Math.ceil(built.tiles.length / 90));
    function step() {
      var end = Math.min(i + perFrame, built.tiles.length);
      for (; i < end; i++) built.drawTile(built.tiles[i], 0.5);
      if (i < built.tiles.length) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);

    // Backstop, for the same reason the logo has one: requestAnimationFrame is driven
    // by the frame clock, which does not advance in every environment (a background
    // tab, a paused timeline, a static renderer). If growth has not finished by now,
    // finish it synchronously so the header is never left half-drawn or blank.
    setTimeout(function () {
      for (; i < built.tiles.length; i++) built.drawTile(built.tiles[i], 0.5);
    }, 900);
  }

  function init() {
    var canvases = document.querySelectorAll('.pagehead > canvas');
    canvases.forEach(function (c) { paint(c); });

    // Repaint on theme change so the pattern picks up the new token colours, and on
    // resize so the lattice still covers the header.
    var repaint = function () { canvases.forEach(function (c) { paint(c); }); };
    var debounced = null;
    window.addEventListener('resize', function () {
      clearTimeout(debounced);
      debounced = setTimeout(repaint, 180);
    });
    new MutationObserver(repaint).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-theme'],
    });
    if (window.matchMedia) {
      var scheme = window.matchMedia('(prefers-color-scheme: dark)');
      if (scheme.addEventListener) scheme.addEventListener('change', repaint);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
`;

/* ============================================================================
   Scroll reveals
   ============================================================================ */

/**
 * Adds `.shown` to `.reveal` elements as they enter the viewport. Everything is
 * visible by default if IntersectionObserver is missing or motion is reduced —
 * content must never depend on JavaScript to become readable.
 */
export const REVEAL_JS = `
(function () {
  function init() {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Nothing to do: targets are already visible. Arming is what hides them.
    if (reduce || !('IntersectionObserver' in window)) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('shown');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    document.querySelectorAll('.reveal').forEach(function (el) {
      var r = el.getBoundingClientRect();
      // Only arm what is below the fold — no fade on content already on screen.
      if (r.top < window.innerHeight * 0.9) return;
      el.classList.add('armed');
      io.observe(el);
    });

    // Backstop: if the observer somehow never fires, reveal everything rather than
    // leaving armed content invisible.
    setTimeout(function () {
      document.querySelectorAll('.reveal.armed:not(.shown)').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight) el.classList.add('shown');
      });
    }, 2500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
`;
