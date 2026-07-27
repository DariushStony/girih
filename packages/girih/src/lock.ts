import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const LOCK_PATH = 'ds.lock';

/**
 * The committed record of tracked forks. Recording {template, templateVersion,
 * baseHash} at eject time is nearly free and cannot be retrofitted — it is what
 * makes a future `girih forks` 3-way merge instead of shadcn's lossy diff.
 */
export interface DsLock {
  version: 1;
  ejected: Record<string, { template: string; templateVersion: number; baseHash: string }>;
  /** The last published version + its contract signature, for semver diffing. Absent until first publish. */
  published?: { version: string; signature: import('./semver.js').PublishSignature };
}

export interface LockReadResult {
  lock: DsLock | null;
  /** True when ds.lock exists but cannot be trusted. */
  invalid: boolean;
}

export async function readLock(root: string): Promise<LockReadResult> {
  let raw: string;
  try {
    raw = await readFile(join(root, LOCK_PATH), 'utf8');
  } catch {
    return { lock: null, invalid: false };
  }
  try {
    const parsed = JSON.parse(raw) as DsLock;
    if (parsed.version !== 1 || typeof parsed.ejected !== 'object' || parsed.ejected === null) {
      return { lock: null, invalid: true };
    }
    return { lock: parsed, invalid: false };
  } catch {
    return { lock: null, invalid: true };
  }
}

export async function writeLock(root: string, lock: DsLock): Promise<void> {
  const stable: DsLock = {
    version: 1,
    ejected: Object.fromEntries(Object.entries(lock.ejected).sort(([a], [b]) => (a < b ? -1 : 1))),
    ...(lock.published ? { published: lock.published } : {}),
  };
  await writeFile(join(root, LOCK_PATH), JSON.stringify(stable, null, 2) + '\n', 'utf8');
}
