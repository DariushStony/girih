import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const TTL_MS = 24 * 60 * 60 * 1000;
const REGISTRY = 'https://registry.npmjs.org';

/**
 * A build tool that phones home on every run is a misfeature, so the registry is
 * consulted at most once a day and never when GIRIH_NO_UPDATE_CHECK is set.
 */
export function updateChecksDisabled(): boolean {
  const value = process.env['GIRIH_NO_UPDATE_CHECK'];
  return value !== undefined && value !== '' && value !== '0' && value !== 'false';
}

/** Outside any workspace, so `doctor` works for a global install too. */
function cacheFile(): string {
  const base = process.env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache');
  return join(base, 'girih', 'registry.json');
}

interface CacheShape {
  fetchedAt: number;
  versions: Record<string, string>;
}

async function readCache(): Promise<CacheShape | null> {
  try {
    const parsed = JSON.parse(await readFile(cacheFile(), 'utf8')) as CacheShape;
    if (typeof parsed.fetchedAt !== 'number' || typeof parsed.versions !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(cache: CacheShape): Promise<void> {
  try {
    const path = cacheFile();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(cache), 'utf8');
  } catch {
    // A cache that cannot be written must never fail the command that used it.
  }
}

/**
 * Latest published version of each name. A name missing from the result was
 * unreachable or unpublished — callers report that as unknown, never as an error,
 * because being offline is not a problem with the user's workspace.
 */
export async function fetchLatestVersions(
  names: readonly string[],
  options: { force?: boolean; timeoutMs?: number } = {},
): Promise<Record<string, string>> {
  if (updateChecksDisabled()) return {};

  if (!options.force) {
    const cached = await readCache();
    if (cached && Date.now() - cached.fetchedAt < TTL_MS && names.every((n) => n in cached.versions)) {
      return cached.versions;
    }
  }

  const signal = AbortSignal.timeout(options.timeoutMs ?? 3000);
  const entries = await Promise.all(
    names.map(async (name) => {
      try {
        // The `latest` dist-tag endpoint returns one small document rather than the
        // full packument, which for a package with many versions is megabytes.
        const response = await fetch(`${REGISTRY}/${name.replace('/', '%2f')}/latest`, { signal });
        if (!response.ok) return null;
        const body = (await response.json()) as { version?: string };
        return body.version ? ([name, body.version] as const) : null;
      } catch {
        return null;
      }
    }),
  );

  const versions = Object.fromEntries(entries.filter((e): e is readonly [string, string] => e !== null));
  if (Object.keys(versions).length > 0) await writeCache({ fetchedAt: Date.now(), versions });
  return versions;
}
