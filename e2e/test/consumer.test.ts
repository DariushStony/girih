import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build as esbuild } from 'esbuild';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const cliPath = join(repoRoot, 'packages/girih/dist/cli.js');
const acme = join(repoRoot, 'examples/acme-ds');
const dsPackage = join(acme, 'packages/design-system');
const scratch = join(repoRoot, 'e2e/.tmp/consumer');
const consumer = join(scratch, 'app');
const tarballs = join(scratch, 'tarballs');

// npm/pnpm/yarn are .cmd shims on Windows, so spawning them there needs a shell —
// the same reason the CLI's own spawnSync calls do this.
const run = (cmd: string, args: string[], cwd: string) =>
  spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });

function pack(packageDir: string): string {
  const result = run('npm', ['pack', '--pack-destination', tarballs], packageDir);
  if (result.status !== 0) throw new Error(`npm pack failed in ${packageDir}:\n${result.stdout}\n${result.stderr}`);
  const tgz = readdirSync(tarballs).filter((f) => f.endsWith('.tgz'));
  const newest = tgz.map((f) => join(tarballs, f)).sort()[tgz.length - 1]!;
  return newest;
}

// The definitive distribution proof: pack the compiled package + runtime as real
// tarballs, install them into a from-scratch consumer with only public deps, and
// server-render every component. Networked + slow, so it lives apart from the fast e2e.
describe('consumer install: pack → install → SSR render', () => {
  let installed = false;

  beforeAll(async () => {
    if (!existsSync(cliPath)) throw new Error('run `pnpm build` before the consumer e2e.');
    await rm(scratch, { recursive: true, force: true });
    await mkdir(tarballs, { recursive: true });
    await mkdir(consumer, { recursive: true });

    // Generate + build the design system fresh, then pack it and the runtime.
    // --force because this test owns the example's output: whatever state a
    // previous run or manual command left behind must not skip the whole suite.
    const generate = run('node', [cliPath, 'generate', 'react', '--force'], acme);
    if (generate.status !== 0) throw new Error(`girih generate react failed:\n${generate.stdout}\n${generate.stderr}`);
    const build = run('node', [cliPath, 'build'], acme);
    if (build.status !== 0) throw new Error(`girih build failed:\n${build.stdout}\n${build.stderr}`);
    const dsTgz = pack(dsPackage);
    const runtimeTgz = pack(join(repoRoot, 'packages/girih-react-runtime'));

    await writeFile(
      join(consumer, 'package.json'),
      JSON.stringify(
        {
          name: 'girih-consumer',
          private: true,
          type: 'module',
          dependencies: {
            '@acme/design-system': `file:${dsTgz}`,
            '@faravahar/girih-react-runtime': `file:${runtimeTgz}`,
            '@base-ui-components/react': '1.0.0-rc.0',
            react: '^19.0.0',
            'react-dom': '^19.0.0',
          },
        },
        null,
        2,
      ),
    );

    const install = run('npm', ['install', '--no-audit', '--no-fund'], consumer);
    installed = install.status === 0;
    if (!installed) throw new Error(`npm install failed:\n${install.stdout}\n${install.stderr}`);
  }, 300_000);

  afterAll(() => rm(join(repoRoot, 'e2e/.tmp/consumer'), { recursive: true, force: true }));

  it('the full acme catalog (checkbox, dialog, extension) passes strict tsc --noEmit', async () => {
    const tsconfigPath = join(dsPackage, 'tsconfig.json');
    await writeFile(
      tsconfigPath,
      JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            noEmit: true,
            jsx: 'react-jsx',
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'bundler',
            lib: ['ES2022', 'DOM'],
            skipLibCheck: true,
          },
          include: ['src'],
        },
        null,
        2,
      ),
    );
    const tscBin = join(repoRoot, 'node_modules/typescript/bin/tsc');
    const result = run('node', [tscBin, '-p', tsconfigPath], dsPackage);
    await rm(tsconfigPath, { force: true });
    expect(result.stdout + result.stderr).toBe('');
    expect(result.status).toBe(0);
  }, 120_000);

  it('resolves the published exports and server-renders every component', async () => {
    expect(installed).toBe(true);
    const smoke = join(consumer, 'smoke.mjs');
    await writeFile(
      smoke,
      `import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { Badge, BrandProvider, Button, Card, Checkbox, Dialog, Input, PaymentButton } from '@acme/design-system';

const html = renderToStaticMarkup(
  h(BrandProvider, { brand: 'seller' },
    h(Card, null,
      h(Button, { variant: 'primary' }, 'Save'),
      h(PaymentButton, null, 'Pay'),
      h(Badge, { tone: 'danger' }, 'New'),
      h(Input, { size: 'md', placeholder: 'Email', invalid: true }),
      h(Checkbox, { defaultChecked: true }),
      h(Dialog.Root, null, h(Dialog.Trigger, null, 'Open')),
    ),
  ),
);
// Dialog.Popup is a forwardRef component (an object, not a function).
for (const part of ['Root', 'Trigger', 'Popup', 'Title', 'Description', 'Close']) {
  if (Dialog[part] == null) throw new Error('Dialog.' + part + ' missing');
}
process.stdout.write(html);
`,
    );
    const result = run('node', ['smoke.mjs'], consumer);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const html = result.stdout;
    expect(html).toContain('data-brand="seller"');
    expect(html).toContain('class="ds-button"');
    expect(html).toContain('class="ds-button ds-x-payment-button"'); // extension rides the base class
    expect(html).toContain('data-tone="danger"'); // Badge
    expect(html).toContain('type="checkbox"'); // Checkbox
    expect(html).toContain('type="button"'); // Button default
    // The invalid state drives both attributes from one prop, through a real install.
    expect(html).toContain('data-invalid="true"');
    expect(html).toContain('aria-invalid="true"');
  }, 60_000);

  // The generated package declares sideEffects: ["**/*.css"] and index.ts is nothing
  // but re-exports, which *should* make it tree-shakeable. Declaring that is not the
  // same as it being true: one accidental side effect at module scope, or a barrel that
  // pulls a sibling in, and a consumer importing Button ships all seven components plus
  // the headless layer. So bundle it for real and look at what survives.
  it('tree-shakes: importing one component drops the other six and the headless layer', async () => {
    expect(installed).toBe(true);
    const entry = join(consumer, 'shake.mjs');
    await writeFile(entry, `import { Button } from '@acme/design-system';\nconsole.log(Button);\n`);

    const out = join(consumer, 'shaken.js');
    // esbuild's JS API, not its binary: the binary is native (so `node <bin>` fails)
    // and its .bin shim is a .cmd on Windows. The API is portable.
    await esbuild({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      minify: true,
      platform: 'browser',
      outfile: out,
      // React stays external — it is the consumer's, and bundling it would swamp the
      // signal being measured.
      external: ['react', 'react-dom'],
      absWorkingDir: consumer,
    });

    const bundle = readFileSync(out, 'utf8');
    // Class names are the reliable marker: minification renames identifiers but these
    // are string literals the components emit.
    expect(bundle).toContain('ds-button');
    for (const dropped of ['ds-badge', 'ds-card', 'ds-checkbox', 'ds-dialog', 'ds-input', 'ds-x-payment-button']) {
      expect(bundle, `${dropped} should have been tree-shaken away`).not.toContain(dropped);
    }
    // Only Dialog needs Base UI, so importing Button must not drag it in.
    expect(bundle).not.toContain('@base-ui-components');
  }, 120_000);
});
