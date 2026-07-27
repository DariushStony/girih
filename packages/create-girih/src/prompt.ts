import { createInterface } from 'node:readline/promises';
import process from 'node:process';

/**
 * Minimal interactive prompts, on Node's own readline.
 *
 * Deliberately not a prompt library. create-girih runs through `npx`, so every
 * dependency is a download the user waits through before seeing the first question —
 * and its whole tarball is currently 7 KB with no runtime dependencies at all.
 * Arrow-key menus are not worth giving that up.
 */

/** Only prompt when a human is there to answer: never in CI, a pipe, or a script. */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY) && !process.env['CI'];
}

export interface AskOptions {
  /** Returned when the answer is empty. */
  default?: string;
  /** Return null to accept, or a message explaining why the answer was rejected. */
  validate?: (value: string) => string | null;
  /**
   * Streams to read and write. Defaults to the process's own. Injectable so the
   * prompt loop — the validation retry in particular — can be tested without a tty,
   * which a piped stdin cannot fake.
   */
  io?: { input: NodeJS.ReadableStream; output: NodeJS.WritableStream };
}

// Written as escape sequences rather than literal control bytes, which do not survive
// a copy-paste or a diff view intact.
const ESC = '[';
const dim = (s: string) => `${ESC}2m${s}${ESC}22m`;
const red = (s: string) => `${ESC}31m${s}${ESC}39m`;

/**
 * Ask until the answer validates. Re-prompts rather than exiting, because the
 * alternative is losing every earlier answer to one typo.
 */
export async function ask(question: string, options: AskOptions = {}): Promise<string> {
  const io = options.io ?? { input: process.stdin, output: process.stdout };
  const rl = createInterface(io);
  // One line iterator for the whole call, rather than a rl.question() per attempt.
  // In non-terminal mode readline drains every buffered line on the first read, so a
  // second question() never resolves — which makes the retry path hang on piped input.
  const lines = rl[Symbol.asyncIterator]();
  try {
    for (;;) {
      const suffix = options.default ? dim(` (${options.default})`) : '';
      io.output.write(`${question}${suffix} `);
      const { value, done } = await lines.next();
      // Input closed (ctrl-D, or a script that stopped answering): take the default
      // if there is one rather than looping forever on an empty stream.
      if (done) {
        if (options.default) return options.default;
        throw new Error(`create-girih: no answer for "${question}" and no default`);
      }
      const answer = String(value).trim() || options.default || '';
      if (!answer) {
        io.output.write(`${red('  a value is required')}\n`);
        continue;
      }
      const problem = options.validate?.(answer);
      if (problem) {
        io.output.write(`${red(`  ${problem}`)}\n`);
        continue;
      }
      return answer;
    }
  } finally {
    // Leaving the interface open holds the process alive after the last question.
    rl.close();
  }
}

export async function confirm(question: string, fallback: boolean, io?: AskOptions['io']): Promise<boolean> {
  const rl = createInterface(io ?? { input: process.stdin, output: process.stdout });
  try {
    const hint = fallback ? 'Y/n' : 'y/N';
    const answer = (await rl.question(`${question} ${dim(`(${hint})`)} `)).trim().toLowerCase();
    if (!answer) return fallback;
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}
