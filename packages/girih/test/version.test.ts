import { describe, expect, it } from 'vitest';
import { compareVersions, isBelow, parseVersion } from '../src/version.js';

describe('parseVersion', () => {
  it('reads all three parts, defaulting the missing ones to zero', () => {
    expect(parseVersion('22.22.1')).toEqual([22, 22, 1]);
    expect(parseVersion('22.13')).toEqual([22, 13, 0]);
    expect(parseVersion('24')).toEqual([24, 0, 0]);
  });

  it('reads the numbers out of a range, since engines fields are ranges', () => {
    expect(parseVersion('>=22.22.1')).toEqual([22, 22, 1]);
    expect(parseVersion('^19.2.8')).toEqual([19, 2, 8]);
  });

  it('is null when there is no version to read', () => {
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('latest')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions([22, 0, 0], [23, 0, 0])).toBe(-1);
    expect(compareVersions([22, 22, 1], [22, 23, 0])).toBe(-1);
    expect(compareVersions([22, 22, 1], [22, 22, 2])).toBe(-1);
    expect(compareVersions([22, 22, 1], [22, 22, 1])).toBe(0);
    expect(compareVersions([24, 0, 0], [22, 22, 1])).toBe(1);
  });

  it('does not compare parts as strings', () => {
    // Regression guard: '9' > '10' lexically, so a string compare would invert this.
    expect(compareVersions([22, 9, 0], [22, 10, 0])).toBe(-1);
  });
});

describe('isBelow', () => {
  // The reason this module exists: girih's Node floor is patch-level (22.22.1), so a
  // major-only check would pass a Node that `engine-strict` then rejects at install.
  it('catches a Node that satisfies the major but not the floor', () => {
    expect(isBelow('22.0.0', '>=22.22.1')).toBe(true);
    expect(isBelow('22.22.0', '>=22.22.1')).toBe(true);
  });

  it('accepts the floor itself and anything newer', () => {
    expect(isBelow('22.22.1', '>=22.22.1')).toBe(false);
    expect(isBelow('24.11.0', '>=22.22.1')).toBe(false);
  });

  it('accepts rather than reports when a version cannot be read', () => {
    // An unknown version is not evidence of a problem, and a false failure here
    // would send someone chasing their Node install for no reason.
    expect(isBelow('', '>=22.22.1')).toBe(false);
    expect(isBelow('22.22.1', '')).toBe(false);
  });
});
