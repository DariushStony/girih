import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { emittedFile } from '@faravahar/girih-core';
import type { EmittedFile } from '@faravahar/girih-core';

const MANIFEST_PATH = '.ds/manifest.json';

export interface Manifest {
  version: 1;
  /**
   * Workspace-relative path → sha256 of what girih last wrote there.
   * One global namespace: the css and react targets overlap on styles/*,
   * and the last write is the truth regardless of which target made it.
   */
  files: Record<string, string>;
  /** target → the workspace-relative paths it wrote on its last run. */
  targets: Record<string, string[]>;
}

export interface ManifestReadResult {
  manifest: Manifest | null;
  /** True when a manifest file exists but cannot be trusted (corrupt / unknown version). */
  invalid: boolean;
}

const normalize = (path: string) => path.replaceAll('\\', '/');

export async function readManifest(root: string): Promise<ManifestReadResult> {
  let raw: string;
  try {
    raw = await readFile(join(root, MANIFEST_PATH), 'utf8');
  } catch {
    return { manifest: null, invalid: false };
  }
  try {
    const parsed = JSON.parse(raw) as Manifest;
    if (parsed.version !== 1 || typeof parsed.files !== 'object' || parsed.files === null || typeof parsed.targets !== 'object') {
      return { manifest: null, invalid: true };
    }
    return { manifest: parsed, invalid: false };
  } catch {
    return { manifest: null, invalid: true };
  }
}

export interface ManifestUpdate {
  next: Manifest;
  /**
   * Workspace-relative paths this target wrote last run but not this run and
   * no other target claims — safe to delete, girih wrote them and the drift
   * gate already proved nobody edited them.
   */
  orphans: string[];
}

export function planManifestUpdate(previous: Manifest | null, target: string, outputBase: string, files: EmittedFile[]): ManifestUpdate {
  const next: Manifest = previous
    ? { version: 1, files: { ...previous.files }, targets: { ...previous.targets } }
    : { version: 1, files: {}, targets: {} };

  const paths = files.map((f) => normalize(join(outputBase, f.path)));
  const newPaths = new Set(paths);
  const claimedByOthers = new Set(
    Object.entries(next.targets)
      .filter(([name]) => name !== target)
      .flatMap(([, targetPaths]) => targetPaths),
  );

  const orphans = (next.targets[target] ?? []).filter((path) => !newPaths.has(path) && !claimedByOthers.has(path));
  for (const orphan of orphans) delete next.files[orphan];

  for (const [i, file] of files.entries()) next.files[paths[i]!] = file.hash;
  next.targets[target] = paths;

  return { next, orphans };
}

export async function writeManifest(root: string, manifest: Manifest): Promise<void> {
  const absolute = join(root, MANIFEST_PATH);
  await mkdir(dirname(absolute), { recursive: true });
  const stable: Manifest = {
    version: 1,
    files: Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => (a < b ? -1 : 1))),
    targets: Object.fromEntries(Object.entries(manifest.targets).sort(([a], [b]) => (a < b ? -1 : 1))),
  };
  await writeFile(absolute, JSON.stringify(stable, null, 2) + '\n', 'utf8');
}

/**
 * Every file girih wrote (any target) whose on-disk contents have since been
 * edited by hand. Missing files are NOT drift — regenerating them is exactly
 * what the user wants.
 */
export async function detectDrift(root: string, manifest: Manifest | null): Promise<string[]> {
  if (!manifest) return [];
  const drifted: string[] = [];
  for (const [path, expectedHash] of Object.entries(manifest.files)) {
    const onDisk = await readFile(join(root, path), 'utf8').catch(() => null);
    if (onDisk === null) continue;
    const actual = emittedFile(path, onDisk).hash;
    if (actual !== expectedHash) drifted.push(path);
  }
  return drifted;
}
