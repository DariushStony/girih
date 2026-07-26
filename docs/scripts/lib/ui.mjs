/**
 * Content helpers shared by every page: escaping, code blocks, callouts, and the
 * four reusable diagram families (tier stack, pipeline rail, package graph, var chain).
 *
 * Every code block goes through `code()`, which guarantees a <pre> with
 * `white-space: pre` and its own horizontal scroll container. Nothing else emits <pre>.
 */

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape for a JS string embedded in a <script> block. */
export function jsStr(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

/**
 * Minimal, honest syntax highlighting. It marks four things and nothing else:
 * comments, string literals, {token.refs}, and a small keyword set. Anything
 * fancier would need a real tokenizer, and would be wrong more often than useful.
 */
export function highlight(source, lang) {
  const text = esc(source);
  if (lang === 'none') return text;

  const KEYWORDS =
    /\b(import|export|from|default|const|let|function|return|type|interface|extends|as|await|async|new|class|if|else|for|of|true|false|null|undefined)\b/g;

  // Split on comments and strings first so we never highlight inside them.
  const parts = [];
  const pattern =
    /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|&quot;(?:[^&\\]|\\.)*?&quot;|'(?:[^'\\]|\\.)*?'|`(?:[^`\\]|\\.)*?`)/g;
  let last = 0;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: 'code', text: text.slice(last, m.index) });
    const chunk = m[0];
    const isComment = chunk.startsWith('/*') || chunk.startsWith('//') || chunk.startsWith('#');
    parts.push({ kind: isComment ? 'comment' : 'string', text: chunk });
    last = m.index + chunk.length;
  }
  if (last < text.length) parts.push({ kind: 'code', text: text.slice(last) });

  return parts
    .map((part) => {
      if (part.kind === 'comment') return `<span class="tk-c">${part.text}</span>`;
      if (part.kind === 'string') {
        // A {token.ref} inside a string is the most important thing on the line.
        const withRefs = part.text.replace(/\{[a-z0-9.\-]+\}/gi, (r) => `<span class="tk-r">${r}</span>`);
        return `<span class="tk-s">${withRefs}</span>`;
      }
      return part.text.replace(KEYWORDS, (k) => `<span class="tk-k">${k}</span>`);
    })
    .join('');
}

/**
 * A code block. `kind` labels provenance, which is the single most important fact
 * about any file in a girih workspace: did a human write it, or did girih emit it?
 */
export function code(source, { path = null, lang = 'ts', kind = null, note = null } = {}) {
  const badges = {
    authored: 'You write this',
    generated: 'girih writes this',
    shell: 'Terminal',
  };
  const badge = kind ? `<span class="badge ${kind}">${esc(badges[kind] ?? kind)}</span>` : '';
  const caption =
    path || kind || note
      ? `<figcaption>
      <span class="path">${esc(path ?? note ?? '')}</span>
      ${badge}
    </figcaption>`
      : '';
  // data-lang is read by the Markdown converter so fences keep their language.
  return `<figure class="code" data-lang="${esc(lang)}">
  ${caption}
  <pre><code>${highlight(source, lang)}</code></pre>
</figure>`;
}

export function callout(kind, title, html) {
  return `<div class="callout ${kind}">
  <div class="title">${esc(title)}</div>
  ${html}
</div>`;
}

/** The ELI5 layer — always the same visual so a reader learns to look for it. */
export const eli5 = (html) => callout('eli5', 'In plain words', html);
export const rule = (title, html) => callout('rule', title, html);
export const gotcha = (title, html) => callout('gotcha', title, html);
export const danger = (title, html) => callout('danger', title, html);

/** Skippable deep background, per the explain-diff-html brief. */
export function aside(summary, html) {
  return `<details class="aside">
  <summary>${esc(summary)}</summary>
  ${html}
</details>`;
}

export function table(headers, rows, { align = [] } = {}) {
  const head = headers.map((h) => `<th>${h}</th>`).join('');
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, i) => `<td${align[i] === 'num' ? ' class="num"' : ''}>${cell}</td>`)
          .join('')}</tr>`,
    )
    .join('\n      ');
  return `<div class="tablewrap">
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>
      ${body}
    </tbody>
  </table>
</div>`;
}

/* ---------------------------------------------------------------- diagram 1 */

/**
 * Tier stack. `tiers` is [{ tier, name, sub, chips: [{ text, state }] }] top-to-bottom,
 * and an arrow is drawn between each pair to show that references only flow downward.
 */
export function tierStack(tiers, { flowLabel = 'may reference' } = {}) {
  const blocks = tiers.map((t, i) => {
    const chips = (t.chips ?? [])
      .map((c) => `<span class="chip${c.state ? ` ${c.state}` : ''}">${esc(c.text)}</span>`)
      .join('');
    const block = `<div class="tier" data-tier="${esc(t.tier)}">
      <div class="name">${esc(t.name)}<span class="sub">${esc(t.sub ?? '')}</span></div>
      <div class="chips">${chips}</div>
    </div>`;
    const arrow =
      i < tiers.length - 1 ? `<div class="flowdown">${esc(flowLabel)}</div>` : '';
    return block + arrow;
  });
  return `<div class="tiers bleed">${blocks.join('\n')}</div>`;
}

/* ---------------------------------------------------------------- diagram 2 */

/** Pipeline rail. `stages` is [{ title, detail, owner, on }]. */
export function rail(stages) {
  const cells = stages
    .map(
      (s, i) => `<div class="stage" data-on="${s.on ? 'true' : 'false'}"${s.owner ? ` data-owner="${esc(s.owner)}"` : ''}>
      <div class="n">${String(i + 1).padStart(2, '0')}</div>
      <div class="t">${esc(s.title)}</div>
      <div class="d">${esc(s.detail)}</div>
    </div>`,
    )
    .join('\n    ');
  return `<div class="rail bleed">
  <div class="track">
    ${cells}
  </div>
</div>`;
}

/* ---------------------------------------------------------------- diagram 3 */

/** Package graph. `rows` is [[{name, role, layer} | '→' | 'text', ...], ...]. */
export function pkgMap(rows) {
  const html = rows
    .map((row) => {
      const items = row
        .map((item) =>
          typeof item === 'string'
            ? `<span class="dep">${esc(item)}</span>`
            : `<span class="pkg" data-layer="${esc(item.layer ?? 'kernel')}">${esc(item.name)}<span class="role">${esc(item.role ?? '')}</span></span>`,
        )
        .join('');
      return `<div class="pkgrow">${items}</div>`;
    })
    .join('\n  ');
  return `<div class="pkgmap bleed">
  ${html}
</div>`;
}

/* ---------------------------------------------------------------- diagram 4 */

const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i;

/** var() chain. `hops` is the shape produced by extract-tokens.mjs. */
export function chainDiagram(hops, { dimAfter = null } = {}) {
  const rowsHtml = hops
    .map((h, i) => {
      const isColor = typeof h.resolved === 'string' && COLOR_RE.test(h.resolved.trim());
      const swatch = isColor
        ? `<span class="swatch" style="background:${esc(h.resolved)}"></span>`
        : '';
      const dim = dimAfter !== null && i > dimAfter ? ' dim' : '';
      return `<div class="hop${dim}" data-tier="${esc(h.tier)}" data-override="${h.overriddenHere ? 'true' : 'false'}">
      <span class="tierbadge">${esc(h.tier)}</span>
      <span class="path">${esc(h.path)}<span style="color:var(--text-faint)"> = ${esc(h.authored)}</span></span>
      <span class="val">${swatch}${esc(String(h.resolved))}</span>
    </div>`;
    })
    .join('\n    ');
  return `<div class="chain bleed">
    ${rowsHtml}
  </div>`;
}

/* ------------------------------------------------------------------- misc */

export function cards(items) {
  return `<div class="cards">
  ${items
    .map(
      (c) => `<a class="card" href="${esc(c.href)}">
    <div class="n">${esc(c.n ?? '')}</div>
    <div class="h">${esc(c.title)}</div>
    <div class="d">${esc(c.detail)}</div>
  </a>`,
    )
    .join('\n  ')}
</div>`;
}

export function strap() {
  return `<hr class="strap">`;
}
