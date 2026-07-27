/**
 * Numeric version comparison, for checking a runtime against a declared floor.
 *
 * Deliberately not a semver implementation: girih compares two concrete versions,
 * never a range, and adding a dependency to do that would be the only reason it was
 * there. What it must get right is comparing all three parts — girih's Node floor is
 * patch-level (22.22.1), so a major-only check would pass a Node that `engine-strict`
 * then rejects at install time.
 */

export type Version = readonly [number, number, number];

/** First `major[.minor[.patch]]` in `text`; missing parts are 0. Null if there is none. */
export function parseVersion(text: string): Version | null {
  const match = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(text);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]! ? -1 : 1;
  }
  return 0;
}

/**
 * Is `actual` older than `floor`? Both may be ranges like '>=22.22.1' — only the
 * numbers are read. False when either is unparseable: an unknown version is not
 * evidence of a problem, and reporting one would be worse than staying quiet.
 */
export function isBelow(actual: string, floor: string): boolean {
  const a = parseVersion(actual);
  const f = parseVersion(floor);
  if (!a || !f) return false;
  return compareVersions(a, f) < 0;
}
