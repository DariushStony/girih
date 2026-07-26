/**
 * Convert the docs' own HTML vocabulary into GitHub-flavoured Markdown.
 *
 * This is not a general HTML-to-Markdown converter and does not try to be. It handles
 * exactly the tags and class names the page modules emit, which is why it can produce
 * clean output: tables stay tables, code fences keep their language, callouts become
 * blockquotes, and the four diagram families degrade into readable lists or tables
 * rather than a soup of stripped tags.
 *
 * Interactive widgets cannot exist in Markdown, so they are replaced by a pointer to
 * the HTML version — stated plainly rather than silently dropped.
 */

// A sentinel that cannot occur in prose or code, so stashed blocks survive the
// tag-stripping passes below and can be restored verbatim at the end.
const BLOCK_OPEN = '[[GIRIH-BLOCK:';
const BLOCK_CLOSE = ']]';

/** Decode the entities `esc()` introduced, for text destined for a code fence. */
function decode(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&');
}

/** Inline HTML → inline Markdown. Leaves <code> as backticks and links as [text](href). */
function inline(html) {
  let out = html;
  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, text) => {
    const label = inline(text).trim();
    // Rewrite sibling page links to the Markdown mirror.
    const target = /^(index|\d\d-[a-z-]+)\.html(#.*)?$/.test(href)
      ? href.replace(/\.html/, '.md')
      : href;
    return `[${label}](${target})`;
  });
  out = out.replace(/<code>([\s\S]*?)<\/code>/gi, (m, t) => {
    const text = decode(t.replace(/<[^>]+>/g, ''));
    // A backtick inside the content needs a longer fence.
    return text.includes('`') ? `\`\` ${text} \`\`` : `\`${text}\``;
  });
  out = out.replace(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/gi, (m, t) => `**${inline(t).trim()}**`);
  out = out.replace(/<(?:i|em)>([\s\S]*?)<\/(?:i|em)>/gi, (m, t) => {
    const text = inline(t).trim();
    return text ? `_${text}_` : '';
  });
  out = out.replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, (m, t) => inline(t));
  out = out.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  out = out.replace(/<[^>]+>/g, '');
  out = decode(out);
  return out.replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n');
}

/** Extract the innerHTML of the first element matching a class, with balanced-tag scanning. */
function extractBlocks(html, tagName, className) {
  const blocks = [];
  const open = new RegExp(`<${tagName}\\b[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, 'gi');
  let m;
  while ((m = open.exec(html)) !== null) {
    const start = m.index;
    const bodyStart = m.index + m[0].length;
    // Balanced scan for the matching close tag.
    const re = new RegExp(`<${tagName}\\b|</${tagName}>`, 'gi');
    re.lastIndex = bodyStart;
    let depth = 1;
    let end = -1;
    let t;
    while ((t = re.exec(html)) !== null) {
      if (t[0].toLowerCase().startsWith('</')) {
        depth--;
        if (depth === 0) { end = t.index; break; }
      } else depth++;
    }
    if (end === -1) continue;
    blocks.push({
      start,
      end: end + `</${tagName}>`.length,
      attrs: m[0],
      body: html.slice(bodyStart, end),
    });
    open.lastIndex = end;
  }
  return blocks;
}

/** Replace matched blocks with rendered markdown, outermost-first, non-overlapping. */
function replaceBlocks(html, tagName, className, renderer) {
  const blocks = extractBlocks(html, tagName, className);
  if (blocks.length === 0) return html;
  let out = '';
  let cursor = 0;
  for (const block of blocks) {
    if (block.start < cursor) continue; // nested inside one we already handled
    out += html.slice(cursor, block.start);
    out += `\n\n${renderer(block).trim()}\n\n`;
    cursor = block.end;
  }
  out += html.slice(cursor);
  return out;
}

function renderTable(body) {
  const headRow = /<thead>[\s\S]*?<tr>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i.exec(body);
  const headers = headRow
    ? [...headRow[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((c) => inline(c[1]).trim())
    : [];
  const bodyPart = /<tbody>([\s\S]*)<\/tbody>/i.exec(body);
  const rows = bodyPart
    ? [...bodyPart[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
        [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
          inline(c[1]).trim().replace(/\n+/g, ' ').replace(/\|/g, '\\|'),
        ),
      )
    : [];
  if (headers.length === 0 && rows.length === 0) return '';
  const width = Math.max(headers.length, ...rows.map((r) => r.length), 1);
  const pad = (cells) => {
    const copy = [...cells];
    while (copy.length < width) copy.push('');
    return copy;
  };
  const lines = [
    `| ${pad(headers).join(' | ')} |`,
    `| ${Array(width).fill('---').join(' | ')} |`,
    ...rows.map((r) => `| ${pad(r).join(' | ')} |`),
  ];
  return lines.join('\n');
}

function renderList(body, ordered) {
  const items = [...body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
  return items
    .map((item, i) => {
      // Nested lists inside an <li>.
      let nested = '';
      const inner = item.replace(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi, (m, tag, innerBody) => {
        nested +=
          '\n' +
          renderList(innerBody, tag.toLowerCase() === 'ol')
            .split('\n')
            .map((l) => (l ? `  ${l}` : l))
            .join('\n');
        return '';
      });
      const marker = ordered ? `${i + 1}.` : '-';
      const text = inline(inner).trim().replace(/\n+/g, ' ');
      return `${marker} ${text}${nested}`;
    })
    .join('\n');
}

/** The four diagram families → readable Markdown. */
function renderTiers(body) {
  const tiers = [...body.matchAll(/<div class="tier" data-tier="([^"]*)">([\s\S]*?)(?=<div class="tier"|<div class="flowdown"|$)/gi)];
  const lines = ['| Tier | Holds | Examples |', '| --- | --- | --- |'];
  for (const [, tier, chunk] of tiers) {
    const name = /<div class="name">([\s\S]*?)<span class="sub">([\s\S]*?)<\/span>/i.exec(chunk);
    const chips = [...chunk.matchAll(/<span class="chip[^"]*">([\s\S]*?)<\/span>/gi)].map((c) =>
      `\`${inline(c[1]).trim()}\``,
    );
    lines.push(
      `| **${name ? inline(name[1]).trim() : tier}** | ${name ? inline(name[2]).trim() : ''} | ${chips.join(', ')} |`,
    );
  }
  lines.push('', '_References flow downward only: component → semantic → global._');
  return lines.join('\n');
}

function renderRail(body) {
  const stages = [...body.matchAll(/<div class="stage"[^>]*>([\s\S]*?)<\/div>\s*(?=<div class="stage"|<\/div>|$)/gi)];
  const parsed = [...body.matchAll(/<div class="t">([\s\S]*?)<\/div>\s*<div class="d">([\s\S]*?)<\/div>/gi)];
  if (parsed.length === 0) return '';
  const lines = ['| # | Stage | What happens |', '| --- | --- | --- |'];
  parsed.forEach(([, t, d], i) => {
    lines.push(`| ${i + 1} | **${inline(t).trim()}** | ${inline(d).trim()} |`);
  });
  return lines.join('\n');
}

function renderPkgMap(body) {
  const rows = [...body.matchAll(/<div class="pkgrow">([\s\S]*?)<\/div>\s*(?=<div class="pkgrow">|$)/gi)];
  const lines = ['```'];
  for (const [, row] of rows) {
    const parts = [];
    const tokenRe = /<span class="pkg"[^>]*>([\s\S]*?)<span class="role">([\s\S]*?)<\/span><\/span>|<span class="dep">([\s\S]*?)<\/span>/gi;
    let m;
    while ((m = tokenRe.exec(row)) !== null) {
      if (m[1] !== undefined) {
        const name = inline(m[1]).trim();
        const role = inline(m[2]).trim();
        parts.push(role ? `${name}  (${role})` : name);
      } else {
        parts.push(inline(m[3]).trim());
      }
    }
    if (parts.length) lines.push(parts.join('  '));
  }
  lines.push('```');
  return lines.length > 2 ? lines.join('\n') : '';
}

function renderChain(body) {
  const hops = [...body.matchAll(/<div class="hop[^"]*" data-tier="([^"]*)" data-override="([^"]*)">([\s\S]*?)(?=<div class="hop|$)/gi)];
  if (hops.length === 0) return '';
  const lines = ['| Tier | Token | Resolves to | |', '| --- | --- | --- | --- |'];
  for (const [, tier, override, chunk] of hops) {
    const path = /<span class="path">([\s\S]*?)<\/span>\s*<span class="val">/i.exec(chunk);
    const val = /<span class="val">([\s\S]*?)<\/span>/i.exec(chunk);
    lines.push(
      `| \`${tier}\` | ${path ? inline(path[1]).trim().replace(/\|/g, '\\|') : ''} | \`${val ? inline(val[1]).trim() : ''}\` | ${
        override === 'true' ? '**overridden here**' : ''
      } |`,
    );
  }
  return lines.join('\n');
}

function renderCards(body) {
  const items = [...body.matchAll(/<a class="card" href="([^"]*)">([\s\S]*?)<\/a>/gi)];
  return items
    .map(([, href, chunk]) => {
      const h = /<div class="h">([\s\S]*?)<\/div>/i.exec(chunk);
      const d = /<div class="d">([\s\S]*?)<\/div>/i.exec(chunk);
      const target = href.replace(/\.html$/, '.md');
      return `- [**${h ? inline(h[1]).trim() : href}**](${target}) — ${d ? inline(d[1]).trim() : ''}`;
    })
    .join('\n');
}

const CALLOUT_LABEL = {
  eli5: '🟢 In plain words',
  rule: '🔵 Rule',
  gotcha: '🟡 Watch out',
  danger: '🔴 Important',
  skip: '⚪️ Aside',
};

/**
 * Convert one page body.
 *
 * @param {string} html      the page body HTML
 * @param {object} opts      { widgetNote } text used where an interactive widget was
 */
export function toMarkdown(html, { widgetNote = '' } = {}) {
  let out = html;
  const stash = [];
  const keep = (md) => {
    stash.push(md);
    return `${BLOCK_OPEN}${stash.length - 1}${BLOCK_CLOSE}`;
  };

  // 1. Code figures first — their contents must not be touched by any later rule.
  out = replaceBlocks(out, 'figure', 'code', ({ attrs, body }) => {
    const cap = /<span class="path">([\s\S]*?)<\/span>/i.exec(body);
    const badge = /<span class="badge (\w+)">([\s\S]*?)<\/span>/i.exec(body);
    const pre = /<pre><code>([\s\S]*?)<\/code><\/pre>/i.exec(body);
    if (!pre) return '';
    const source = decode(pre[1].replace(/<[^>]+>/g, ''));
    const label = [cap && inline(cap[1]).trim(), badge && `[${inline(badge[2]).trim()}]`]
      .filter(Boolean)
      .join('  ');
    // Carry the language onto the fence so GitHub highlights it. 'none' means plain.
    const declared = /data-lang="([^"]*)"/.exec(attrs)?.[1] ?? '';
    const lang = declared === 'none' ? '' : declared;
    const fence = source.includes('```') ? '````' : '```';
    return keep(`${label ? `**${label}**\n\n` : ''}${fence}${lang}\n${source}\n${fence}`);
  });

  // 2. Widgets — cannot be represented; say so.
  out = replaceBlocks(out, 'div', 'widget', ({ body }) => {
    const title = /<span class="wt">([\s\S]*?)<\/span>/i.exec(body);
    const hint = /<span class="wh">([\s\S]*?)<\/span>/i.exec(body);
    const name = title ? inline(title[1]).trim() : 'Interactive widget';
    return keep(
      `> **▶ ${name}** — interactive\n>\n> ${
        hint ? inline(hint[1]).trim() + '. ' : ''
      }${widgetNote}`,
    );
  });

  // 3. Diagram families.
  out = replaceBlocks(out, 'div', 'tiers', ({ body }) => keep(renderTiers(body)));
  out = replaceBlocks(out, 'div', 'rail', ({ body }) => keep(renderRail(body)));
  out = replaceBlocks(out, 'div', 'pkgmap', ({ body }) => keep(renderPkgMap(body)));
  out = replaceBlocks(out, 'div', 'chain', ({ body }) => keep(renderChain(body)));
  out = replaceBlocks(out, 'div', 'cards', ({ body }) => keep(renderCards(body)));

  // 4. Tables.
  out = replaceBlocks(out, 'div', 'tablewrap', ({ body }) => keep(renderTable(body)));

  // 5. Callouts and asides.
  out = replaceBlocks(out, 'div', 'callout', ({ attrs, body }) => {
    const kind = /callout\s+(\w+)/.exec(attrs)?.[1] ?? 'rule';
    const title = /<div class="title">([\s\S]*?)<\/div>/i.exec(body);
    const rest = body.replace(/<div class="title">[\s\S]*?<\/div>/i, '');
    const label = CALLOUT_LABEL[kind] ?? '🔵 Note';
    const heading = title ? inline(title[1]).trim() : '';
    const inner = toMarkdown(rest, { widgetNote }).trim();
    const quoted = inner.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');
    return keep(`> **${label}${heading && heading !== 'In plain words' ? ` — ${heading}` : ''}**\n>\n${quoted}`);
  });

  out = replaceBlocks(out, 'details', 'aside', ({ body }) => {
    const summary = /<summary>([\s\S]*?)<\/summary>/i.exec(body);
    const rest = body.replace(/<summary>[\s\S]*?<\/summary>/i, '');
    const inner = toMarkdown(rest, { widgetNote }).trim();
    return keep(
      `<details>\n<summary><b>${summary ? inline(summary[1]).trim() : 'More'}</b></summary>\n\n${inner}\n\n</details>`,
    );
  });

  // 6. Lists.
  out = replaceBlocks(out, 'ol', 'x-never-matches', () => '');
  out = out.replace(/<(ul|ol)([^>]*)>([\s\S]*?)<\/\1>/gi, (m, tag, attrs, body) => {
    if (/class="(opts|chips)"/.test(attrs)) return '';
    return `\n\n${keep(renderList(body, tag.toLowerCase() === 'ol'))}\n\n`;
  });

  // 7. Headings and paragraphs.
  out = out.replace(/<h2[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h2>/gi, (m, id, t) => `\n\n## ${inline(t).trim()}\n\n`);
  out = out.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (m, t) => `\n\n## ${inline(t).trim()}\n\n`);
  out = out.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (m, t) => `\n\n### ${inline(t).trim()}\n\n`);
  out = out.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (m, t) => `\n\n#### ${inline(t).trim()}\n\n`);
  out = out.replace(/<p class="lede"[^>]*>([\s\S]*?)<\/p>/gi, (m, t) => `\n\n${inline(t).trim()}\n\n`);
  out = out.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (m, t) => {
    const text = inline(t).trim();
    return text ? `\n\n${text}\n\n` : '\n\n';
  });
  out = out.replace(/<hr[^>]*>/gi, '\n\n---\n\n');

  // 8. Anything structural left over: keep the text, drop the tags.
  out = out.replace(/<\/?(div|section|span|main|nav|header|footer|figure|figcaption|pre|button|input|select|option|svg|polygon|table|thead|tbody|tr|th|td|li|summary|details)[^>]*>/gi, '');
  out = out.replace(/<[^>]+>/g, '');
  out = decode(out);

  // 9. Restore stashed blocks.
  out = out.replace(/\[\[GIRIH-BLOCK:(\d+)\]\]/g, (m, i) => stash[Number(i)]);

  // 10. Tidy whitespace. Source HTML is wrapped for readability, which leaves a leading
  //     space on continuation lines; strip it, but never inside a fenced block.
  const lines = out.split('\n');
  let inFence = false;
  const tidied = lines.map((line) => {
    if (/^\s*(```|````)/.test(line)) {
      inFence = !inFence;
      return line.replace(/[ \t]+$/, '');
    }
    if (inFence) return line;
    return line.replace(/^[ \t]+(?=\S)/, '').replace(/[ \t]+$/, '');
  });

  return tidied.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
