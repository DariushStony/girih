import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { ask, confirm, isInteractive } from '../src/prompt.js';

/** A fake terminal: answers are queued, and everything written is captured. */
function fakeIo(answers: string[]) {
  const input = new PassThrough();
  const output = new PassThrough();
  let written = '';
  output.on('data', (chunk: Buffer) => {
    written += chunk.toString();
  });
  // readline consumes a line at a time, so queueing them all up front is enough.
  for (const answer of answers) input.write(`${answer}\n`);
  return {
    io: { input, output },
    get written() {
      return written;
    },
  };
}

describe('ask', () => {
  it('returns the typed answer', async () => {
    const t = fakeIo(['my-ds']);
    expect(await ask('Directory', { io: t.io })).toBe('my-ds');
  });

  it('falls back to the default on an empty answer, and shows it', async () => {
    const t = fakeIo(['']);
    expect(await ask('Directory', { default: 'my-ds', io: t.io })).toBe('my-ds');
    expect(t.written).toContain('my-ds');
  });

  it('re-asks on a rejected answer instead of exiting', async () => {
    // The reason the loop exists: exiting on a typo would discard every earlier answer.
    const t = fakeIo(['Bad Brand', 'nope!', 'seller']);
    const value = await ask('Default brand', {
      io: t.io,
      validate: (v) => (/^[a-z][a-z0-9-]*$/.test(v) ? null : 'must be lowercase kebab-case'),
    });
    expect(value).toBe('seller');
    // Once per rejection, so the user is told why rather than just asked again.
    expect(t.written.match(/must be lowercase kebab-case/g)).toHaveLength(2);
  });

  it('rejects an empty answer when there is no default', async () => {
    const t = fakeIo(['', 'ok']);
    expect(await ask('Name', { io: t.io })).toBe('ok');
    expect(t.written).toContain('a value is required');
  });

  it('trims surrounding whitespace', async () => {
    const t = fakeIo(['  my-ds  ']);
    expect(await ask('Directory', { io: t.io })).toBe('my-ds');
  });
});

describe('confirm', () => {
  it('takes the fallback on an empty answer', async () => {
    expect(await confirm('Install?', true, fakeIo(['']).io)).toBe(true);
    expect(await confirm('Install?', false, fakeIo(['']).io)).toBe(false);
  });

  it('accepts y and yes, and treats anything else as no', async () => {
    expect(await confirm('Install?', false, fakeIo(['y']).io)).toBe(true);
    expect(await confirm('Install?', false, fakeIo(['YES']).io)).toBe(true);
    expect(await confirm('Install?', true, fakeIo(['n']).io)).toBe(false);
    expect(await confirm('Install?', true, fakeIo(['whatever']).io)).toBe(false);
  });
});

describe('isInteractive', () => {
  it('is false under a test runner, where stdin is not a tty', () => {
    // The guard that keeps `npx create-girih` in CI a clean error rather than a hang.
    expect(isInteractive()).toBe(false);
  });
});
