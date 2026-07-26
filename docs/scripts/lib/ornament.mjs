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

/* ============================================================================
   The banner — a living Isfahan tile
   ============================================================================ */

/**
 * The page-header banner: a real girih tessellation with light raking across it.
 *
 * Two things move. The lattice drifts sideways one full period every 70 seconds, and a
 * soft band of brighter glaze sweeps across every 14 seconds — the way light crosses a
 * tiled wall through the day. Both are slow on purpose: this sits behind a headline, so
 * it has to be felt rather than watched.
 *
 * The cost is kept down by pre-rendering the pattern twice, dim and bright, into
 * offscreen canvases one lattice period wider than the header. A frame is then two
 * drawImage calls and a gradient fill instead of several hundred strokes, throttled to
 * ~30fps, paused whenever the banner scrolls out of view or the tab is hidden.
 */
export const TESSELLATION_JS = `
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  function tokenColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /**
   * Draw the girih tessellation onto a context.
   *
   * The construction is the real ten-fold one: decagons on a staggered lattice, each
   * carrying strapwork that crosses its edges at the same angle, at the same points.
   * Because every tile treats its edges identically the lines continue across tile
   * boundaries — which is the whole girih method, and the reason this pattern is the
   * documentation's ornament rather than a decorative flourish.
   *
   * @param intensity  0..1 — how strongly the glaze reads. Two passes at different
   *                   intensities are what the light-rake interpolates between.
   */
  function drawPattern(ctx, w, h, R, colors, intensity) {
    var stepX = R * 2 * Math.cos(Math.PI / 10);
    var stepY = R * (1 + Math.cos(Math.PI / 5));

    for (var row = -1; row * stepY < h + stepY; row++) {
      for (var col = -1; col * stepX < w + stepX; col++) {
        var cx = col * stepX + (row % 2 === 0 ? 0 : stepX / 2);
        var cy = row * stepY;

        var pts = [];
        for (var i = 0; i < 10; i++) {
          var a = (Math.PI * 2 / 10) * i - Math.PI / 2;
          pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
        }
        var mids = [];
        for (var j = 0; j < 10; j++) {
          var p = pts[j], q = pts[(j + 1) % 10];
          mids.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
        }

        // The tile's own cut edge — the faintest layer, the construction line.
        ctx.beginPath();
        for (var k = 0; k < 10; k++) k ? ctx.lineTo(pts[k][0], pts[k][1]) : ctx.moveTo(pts[k][0], pts[k][1]);
        ctx.closePath();
        ctx.strokeStyle = colors.rule;
        ctx.globalAlpha = 0.16 * intensity;
        ctx.lineWidth = 0.6;
        ctx.stroke();

        // Strapwork. Adjacent midpoints would trace a smaller decagon; the girih star
        // comes from stepping THREE midpoints at a time, which draws a {10/3} decagram.
        // These are the lines that continue across tile edges unbroken.
        ctx.beginPath();
        for (var m = 0, at = 0; m < 10; m++, at = (at + 3) % 10) {
          var pt = mids[at];
          m ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]);
        }
        ctx.closePath();
        ctx.strokeStyle = colors.strap;
        ctx.globalAlpha = 0.5 * intensity;
        ctx.lineWidth = 1;
        ctx.stroke();

        // The ten-pointed star at the heart of the tile.
        ctx.beginPath();
        for (var s = 0; s < 10; s++) {
          var mid = mids[s];
          var ix = mid[0] + (cx - mid[0]) * 0.42;
          var iy = mid[1] + (cy - mid[1]) * 0.42;
          s ? ctx.lineTo(ix, iy) : ctx.moveTo(ix, iy);
        }
        ctx.closePath();
        ctx.strokeStyle = colors.star;
        ctx.globalAlpha = 0.44 * intensity;
        ctx.lineWidth = 0.9;
        ctx.stroke();

        // At full intensity the star also takes a wash of glaze, so the rake of light
        // reads as glazed ceramic catching the sun rather than as lines brightening.
        if (intensity > 0.9) {
          ctx.fillStyle = colors.star;
          ctx.globalAlpha = 0.05;
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function makeLayer(w, h, dpr) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    var cx = c.getContext('2d');
    if (cx) cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { canvas: c, ctx: cx };
  }

  function setup(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (!w || !h) return null;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var R = 46;
    var stepX = R * 2 * Math.cos(Math.PI / 10);
    var colors = {
      rule: tokenColor('--rule-strong', '#C6BDA4'),
      strap: tokenColor('--accent', '#2E5BC9'),
      star: tokenColor('--good', '#00A0A0')
    };

    // Two pre-rendered passes, one stepX wider than the header so the drift can wrap
    // seamlessly. Per-frame work is then a couple of drawImage calls rather than a few
    // hundred strokes — which is what makes a permanent animation affordable.
    var layerW = w + stepX + 2;
    var dim = makeLayer(layerW, h, dpr);
    var bright = makeLayer(layerW, h, dpr);
    var masked = makeLayer(layerW, h, dpr);
    if (!dim.ctx || !bright.ctx || !masked.ctx) return null;

    drawPattern(dim.ctx, layerW, h, R, colors, 0.55);
    drawPattern(bright.ctx, layerW, h, R, colors, 1);

    return { canvas: canvas, ctx: ctx, w: w, h: h, dpr: dpr, stepX: stepX,
             dim: dim, bright: bright, masked: masked, layerW: layerW };
  }

  /** One composited frame: drifted base, plus a raking band of brighter glaze. */
  function frame(st, t) {
    var ctx = st.ctx;
    // Drift: one lattice period every 70s. Slow enough to be felt rather than watched.
    var drift = -(t / 70000 * st.stepX) % st.stepX;
    // The rake sweeps a full width every 14s, and is a soft band, not a hard edge.
    var sweep = ((t % 14000) / 14000) * (st.w + 900) - 450;

    ctx.clearRect(0, 0, st.w, st.h);
    ctx.drawImage(st.dim.canvas, drift, 0, st.layerW, st.h);

    var mctx = st.masked.ctx;
    mctx.clearRect(0, 0, st.layerW, st.h);
    mctx.drawImage(st.bright.canvas, 0, 0, st.layerW, st.h);
    // Keep only the band: a soft-edged gradient used as an alpha mask.
    mctx.globalCompositeOperation = 'destination-in';
    var g = mctx.createLinearGradient(sweep - drift - 320, 0, sweep - drift + 320, st.h * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    mctx.fillStyle = g;
    mctx.fillRect(0, 0, st.layerW, st.h);
    mctx.globalCompositeOperation = 'source-over';

    ctx.drawImage(st.masked.canvas, drift, 0, st.layerW, st.h);
  }

  function animate(canvas) {
    var st = setup(canvas);
    if (!st) return null;

    // Static single pass when motion is unwelcome — the pattern is still there.
    if (reduce.matches) {
      st.ctx.drawImage(st.dim.canvas, 0, 0, st.layerW, st.h);
      return { stop: function () {}, restart: function () {} };
    }

    var raf = 0;
    var last = 0;
    var running = false;
    var t0 = null;

    // ~30fps is plenty for a slow ambient pattern and halves the battery cost.
    function loop(now) {
      if (!running) return;
      if (t0 === null) t0 = now;
      if (now - last >= 32) {
        last = now;
        frame(st, now - t0);
      }
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    // Paint one frame immediately: if rAF never advances — a background tab, a paused
    // timeline, a static renderer — the banner is still a finished tile rather than blank.
    frame(st, 0);
    start();

    // Only animate while the banner is actually on screen.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { e.isIntersecting ? start() : stop(); });
      }, { threshold: 0 });
      io.observe(canvas);
    }
    document.addEventListener('visibilitychange', function () {
      document.hidden ? stop() : start();
    });

    return { stop: stop, restart: function () { stop(); } };
  }

  function init() {
    var instances = [];
    function build() {
      instances.forEach(function (i) { i && i.stop(); });
      instances = [];
      document.querySelectorAll('.pagehead > canvas').forEach(function (c) {
        instances.push(animate(c));
      });
    }
    build();

    var debounce = null;
    window.addEventListener('resize', function () {
      clearTimeout(debounce);
      debounce = setTimeout(build, 200);
    });
    // Rebuild on theme change so the glaze picks up the new token colours.
    new MutationObserver(build).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-theme']
    });
    if (window.matchMedia) {
      var scheme = window.matchMedia('(prefers-color-scheme: dark)');
      if (scheme.addEventListener) scheme.addEventListener('change', build);
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
