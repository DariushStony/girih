import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defineSpec, specToIR } from '@faravahar/girih-spec';
import { generateReact } from '@faravahar/girih-generator-react';
// Not public API: this pins girih's generator to girih's runtime, and a consumer
// never needs it. Imported from source rather than widening the package surface.
import { RUNTIME_VERSION_RANGE } from '../src/generate.js';

const manifest = (path: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')) as { name: string; version: string };

const runtime = manifest('../../girih-react-runtime/package.json');

const buttonIR = () =>
  specToIR(
    defineSpec({
      name: 'Button',
      element: 'button',
      slots: { children: { required: true } },
      accessibility: { focusable: true },
    }),
  ).ir;

// The range below lands in a package.json the *consumer* publishes, so getting it
// wrong breaks their install rather than ours — and it cannot be derived at runtime
// because the generator never talks to the registry.
describe('generated runtime dependency range', () => {
  it('is satisfiable by the runtime version actually being published', () => {
    // Internal deps publish as exact pins, so the workspace is lockstep whether or
    // not it intends to be — and `^0.x` admits one minor, so a bump must move this too.
    expect(RUNTIME_VERSION_RANGE).toBe(`^${runtime.version}`);
  });

  it('is what generateReact writes into the emitted package.json', () => {
    const { files } = generateReact([buttonIR()], { packageName: '@acme/design-system', prefix: 'ds' });
    const emitted = files.find((f) => f.path === 'package.json');
    expect(emitted).toBeDefined();
    const parsed = JSON.parse(emitted!.contents) as { dependencies: Record<string, string> };
    expect(parsed.dependencies[runtime.name]).toBe(RUNTIME_VERSION_RANGE);
  });
});
