#!/usr/bin/env node
/**
 * Fetch Roboto and Vazirmatn as WOFF2 and inline them into docs/data/fonts.json
 * as base64 data URIs.
 *
 * Why inline rather than link: the published pages run under a strict CSP that blocks
 * every external host — no font CDNs. A linked webfont would fail silently and fall
 * back, which is worse than not using it. Inlining is the only way to guarantee the
 * typography a reader actually sees.
 *
 * Only the subsets we need are fetched: Roboto latin (body and UI), Vazirmatn latin
 * (display) and Vazirmatn arabic (Persian). Google's css2 endpoint already serves
 * per-script subsets, so we take those rather than subsetting ourselves.
 *
 * This is the only script here that needs network. Its output is committed, so the
 * docs build and CI never hit the network.
 *
 * Usage:  node docs/scripts/fetch-fonts.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const outPath = join(repoRoot, 'docs/data/fonts.json');

// A modern UA is required or Google serves TTF instead of WOFF2.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const REQUESTS = [
  {
    family: 'Roboto',
    css: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
    // Body and UI text: Latin only. Roboto's other subsets would be dead weight.
    subsets: ['latin'],
    weights: [400, 500, 700],
    role: 'body',
  },
  {
    family: 'Vazirmatn',
    css: 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@500;600;700&display=swap',
    // Display headings (latin) plus every Persian glyph (arabic).
    subsets: ['latin', 'arabic'],
    weights: [500, 600, 700],
    role: 'display',
  },
];

async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

async function getBytes(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Google's css2 output is a run of @font-face blocks, each preceded by a
 * `/* subset *\/` comment. Parse into { subset, weight, style, url, unicodeRange }.
 */
function parseFontFaces(css) {
  const faces = [];
  // Split on the subset comments so each chunk carries its subset name.
  const chunks = css.split(/\/\*\s*([a-z0-9-[\]]+)\s*\*\//i);
  for (let i = 1; i < chunks.length; i += 2) {
    const subset = chunks[i];
    const block = chunks[i + 1] ?? '';
    for (const face of block.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)) {
      const body = face[1];
      const url = /src:\s*url\(([^)]+)\)/.exec(body)?.[1];
      const weight = /font-weight:\s*(\d+)/.exec(body)?.[1];
      const style = /font-style:\s*(\w+)/.exec(body)?.[1] ?? 'normal';
      const unicodeRange = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim();
      if (url && weight) {
        faces.push({ subset, weight: Number(weight), style, url, unicodeRange });
      }
    }
  }
  return faces;
}

const out = { generatedBy: 'docs/scripts/fetch-fonts.mjs', families: {}, totalBytes: 0 };

for (const req of REQUESTS) {
  const css = await getText(req.css);
  const faces = parseFontFaces(css).filter((f) => req.subsets.includes(f.subset) && req.weights.includes(f.weight) && f.style === 'normal');

  if (faces.length === 0) {
    console.error(`No matching faces for ${req.family}. Google's CSS was:\n${css.slice(0, 800)}`);
    process.exit(1);
  }

  // Both families are variable fonts, so Google serves the SAME file for every
  // requested weight — three identical downloads per subset. Dedupe by content hash
  // and declare one @font-face per subset with the full `font-weight` range: a third
  // of the bytes, and every weight in between rather than just the three we asked for.
  const collected = [];
  const byHash = new Map();
  for (const face of faces) {
    const bytes = await getBytes(face.url);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const existing = byHash.get(hash);
    if (existing) {
      existing.weights.push(face.weight);
      continue;
    }
    const entry = {
      subset: face.subset,
      weights: [face.weight],
      unicodeRange: face.unicodeRange,
      bytes: bytes.length,
      dataUri: `data:font/woff2;base64,${bytes.toString('base64')}`,
    };
    byHash.set(hash, entry);
    collected.push(entry);
    out.totalBytes += bytes.length;
  }

  for (const entry of collected) {
    // A single file covering several requested weights is a variable font; express
    // that as a range so intermediate weights work too.
    const min = Math.min(...entry.weights);
    const max = Math.max(...entry.weights);
    entry.variable = entry.weights.length > 1;
    entry.weightRange = entry.variable ? `${min} ${max}` : String(min);
    console.log(
      `  ${req.family.padEnd(10)} ${entry.subset.padEnd(7)} ${entry.weightRange.padEnd(9)} ` +
        `${String(entry.bytes).padStart(7)} bytes${entry.variable ? '  (variable, deduped from ' + entry.weights.length + ' requests)' : ''}`,
    );
  }

  out.families[req.family] = { role: req.role, faces: collected };
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');

const base64Bytes = JSON.stringify(out).length;
console.log(`\nWrote docs/data/fonts.json`);
console.log(`  raw font bytes    ${(out.totalBytes / 1024).toFixed(0)}kb`);
console.log(`  base64 inflated   ${(base64Bytes / 1024).toFixed(0)}kb  (added to every page)`);
