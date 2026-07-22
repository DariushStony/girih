import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scaffoldWorkspace } from '../../packages/cli/src/scaffold.js';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const cliPath = join(repoRoot, 'packages/cli/dist/cli.js');
const workspace = join(repoRoot, 'e2e/.tmp/e2e-ds');

function girih(...args: string[]): { status: number | null; output: string } {
  const result = spawnSync('node', [cliPath, ...args], { cwd: workspace, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

describe('e2e: scaffold → check → generate → drift', () => {
  beforeAll(async () => {
    if (!existsSync(cliPath)) {
      throw new Error('packages/cli/dist/cli.js missing — run `pnpm build` before the e2e tests.');
    }
    await rm(workspace, { recursive: true, force: true });
    await mkdir(workspace, { recursive: true });
    await scaffoldWorkspace(workspace, { name: '@e2e/design-system', brand: 'main' });
  });

  afterAll(() => rm(join(repoRoot, 'e2e/.tmp'), { recursive: true, force: true }));

  it('checks a fresh workspace clean', () => {
    const { status, output } = girih('check', '--no-table');
    expect(output).toContain('1 component contract: Button');
    expect(output).toContain('✔ no problems');
    expect(status).toBe(0);
  });

  it('generates the react package, manifest, and canonical IR', async () => {
    const { status, output } = girih('generate', 'react');
    expect(status).toBe(0);
    expect(output).toContain('src/Button.tsx');

    for (const path of [
      'packages/design-system/src/Button.tsx',
      'packages/design-system/src/index.ts',
      'packages/design-system/styles/tokens.css',
      'packages/design-system/styles/components.css',
      'packages/design-system/package.json',
      '.ds/manifest.json',
      '.ds/ir/Button.json',
    ]) {
      expect(existsSync(join(workspace, path)), path).toBe(true);
    }

    const ir = JSON.parse(await readFile(join(workspace, '.ds/ir/Button.json'), 'utf8'));
    expect(ir.name).toBe('Button');
    expect(ir.variants[0].values).toEqual(['primary', 'secondary', 'danger']);

    expect(girih('generate', 'react', '--check').status).toBe(0);
  });

  it('refuses to overwrite hand-edited output, honors --force', async () => {
    await appendFile(join(workspace, 'packages/design-system/src/Button.tsx'), '\n// hand edit\n');

    const drifted = girih('generate', 'react');
    expect(drifted.status).toBe(1);
    expect(drifted.output).toContain('edited');
    expect(drifted.output).toContain('refusing to overwrite');

    const check = girih('check', '--no-table');
    expect(check.output).toContain('GIRIH1010');

    const forced = girih('generate', 'react', '--force');
    expect(forced.status).toBe(0);
    const restored = await readFile(join(workspace, 'packages/design-system/src/Button.tsx'), 'utf8');
    expect(restored).not.toContain('// hand edit');
  });

  it('adds a hyphenated brand with `girih brand create` and stays valid', async () => {
    const { status, output } = girih('brand', 'create', 'dark-mode');
    expect(status).toBe(0);
    expect(output).toContain('brands/dark-mode/tokens.json');
    // Keys are quoted — a hyphenated name must never corrupt the config.
    expect(await readFile(join(workspace, 'ds.config.ts'), 'utf8')).toContain("'dark-mode': { tokens: 'brands/dark-mode/tokens.json' },");

    const check = girih('check', '--no-table');
    expect(check.output).toContain('2 brands');
    expect(check.output).toContain('main (default)');
    expect(check.output).toContain('dark-mode');
    expect(check.status).toBe(0);
  });

  it('refuses invalid brand and package names at init time', async () => {
    const badBrandDir = join(repoRoot, 'e2e/.tmp/bad-brand');
    await mkdir(badBrandDir, { recursive: true });
    const result = spawnSync('node', [cliPath, 'init', '--brand', 'My Brand'], { cwd: badBrandDir, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('kebab-case');
    expect(existsSync(join(badBrandDir, 'ds.config.ts'))).toBe(false);
  });

  it('scaffolds a demo page that renders without a bundler', () => {
    expect(existsSync(join(workspace, 'demo/index.html'))).toBe(true);
  });

  it('ejects Button into a tracked fork and stitches user edits back in', async () => {
    const eject = girih('eject', 'Button');
    expect(eject.status).toBe(0);
    expect(eject.output).toContain('components/ejected/Button.tsx');

    const lock = JSON.parse(await readFile(join(workspace, 'ds.lock'), 'utf8'));
    expect(lock.ejected.Button.template).toBe('element');
    expect(lock.ejected.Button.templateVersion).toBeGreaterThan(0);
    expect(lock.ejected.Button.baseHash).toMatch(/^[0-9a-f]{64}$/);

    // Ejecting twice is an error, not a silent overwrite.
    expect(girih('eject', 'Button').status).toBe(1);

    // Fork the markup — this file is user-owned now.
    const ejectedPath = join(workspace, 'components/ejected/Button.tsx');
    const forked = (await readFile(ejectedPath, 'utf8')).replace("cx('ds-button'", "cx('ds-button forked'");
    await writeFile(ejectedPath, forked);

    const generate = girih('generate', 'react');
    expect(generate.status).toBe(0);

    // The fork is stitched into the package verbatim…
    const stitched = await readFile(join(workspace, 'packages/design-system/src/Button.tsx'), 'utf8');
    expect(stitched).toContain("cx('ds-button forked'");
    // …while its CSS is still generated from the spec (token plumbing never forks).
    const css = await readFile(join(workspace, 'packages/design-system/styles/components.css'), 'utf8');
    expect(css).toContain('.ds-button[data-variant="primary"]');

    // check reports the ejected state
    const check = girih('check', '--no-table');
    expect(check.output).toContain('Button');
    expect(check.output).toContain('ejected');
  });

  it('generated output passes tsc --noEmit — types are part of the contract', async () => {
    await writeFile(
      join(workspace, 'packages/design-system/tsconfig.json'),
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
    const result = spawnSync('node', [tscBin, '-p', join(workspace, 'packages/design-system/tsconfig.json')], {
      cwd: workspace,
      encoding: 'utf8',
    });
    expect(result.stdout + result.stderr).toBe('');
    expect(result.status).toBe(0);
  }, 60_000);

  it('the full acme catalog (checkbox, dialog, extension) also passes tsc --noEmit', async () => {
    const acme = join(repoRoot, 'examples/acme-ds');
    const generate = spawnSync('node', [cliPath, 'generate', 'react'], { cwd: acme, encoding: 'utf8' });
    expect(generate.status).toBe(0);

    const tsconfigPath = join(acme, 'packages/design-system/tsconfig.json');
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
    const result = spawnSync('node', [tscBin, '-p', tsconfigPath], { cwd: acme, encoding: 'utf8' });
    await rm(tsconfigPath, { force: true });
    expect(result.stdout + result.stderr).toBe('');
    expect(result.status).toBe(0);
  }, 120_000);
});
