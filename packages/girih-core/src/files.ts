import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface EmittedFile {
  /** Path relative to the emit root. */
  path: string;
  contents: string;
  /** sha256 of contents — used for drift detection and publish diffing. */
  hash: string;
}

export function emittedFile(path: string, contents: string): EmittedFile {
  return { path, contents, hash: createHash('sha256').update(contents).digest('hex') };
}

export async function writeEmittedFiles(root: string, files: EmittedFile[]): Promise<void> {
  for (const file of files) {
    const absolute = join(root, file.path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, file.contents, 'utf8');
  }
}

/** Paths (relative to root) whose on-disk contents differ from the given files — the CI staleness gate. */
export async function verifyEmittedFiles(root: string, files: EmittedFile[]): Promise<string[]> {
  const stale: string[] = [];
  for (const file of files) {
    const onDisk = await readFile(join(root, file.path), 'utf8').catch(() => null);
    if (onDisk !== file.contents) stale.push(file.path);
  }
  return stale;
}
