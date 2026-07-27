import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface ScaffoldOptions {
  /** Published package name, e.g. '@acme/design-system'. */
  name: string;
  /** Default brand name. */
  brand: string;
}

export interface ScaffoldResult {
  written: string[];
  skipped: string[];
}

/**
 * The workspace package.json `girih create` writes. `girih init` deliberately does not
 * write one — it adds girih to a project that already has its own.
 *
 * The girih packages are pinned to the running CLI's version rather than to a range,
 * because internal deps publish as exact pins: a workspace whose CLI and runtime
 * disagree fails in confusing ways, and `girih doctor` reports exactly that skew.
 * react is a devDependency because the emitted TSX is compiled here, not by the
 * consumer; react-dom is absent because the scaffolded demo needs no renderer.
 */
export function workspacePackageJson(options: {
  workspaceName: string;
  cliPackage: string;
  runtimePackage: string;
  version: string;
}): string {
  const { workspaceName, cliPackage, runtimePackage, version } = options;
  return (
    JSON.stringify(
      {
        name: workspaceName,
        private: true,
        type: 'module',
        scripts: {
          check: 'girih check',
          generate: 'girih generate react',
          'generate:check': 'girih generate react --check',
          build: 'girih build',
        },
        devDependencies: {
          [cliPackage]: `^${version}`,
          [runtimePackage]: `^${version}`,
          '@types/react': '^19.0.0',
          react: '^19.0.0',
        },
      },
      null,
      2,
    ) + '\n'
  );
}

/**
 * The starter workspace `girih init` and `create-girih` write. Three token
 * tiers, one brand, one component contract — small enough to read in one
 * sitting, real enough that `girih generate react` produces a working Button.
 */
export function workspaceTemplate(options: ScaffoldOptions): Record<string, string> {
  const { name, brand } = options;
  return {
    'ds.config.ts': `import { defineConfig } from '@faravahar/girih';

export default defineConfig({
  name: '${name}',
  brands: {
    default: '${brand}',
    definitions: {
      '${brand}': { tokens: 'brands/${brand}/tokens.json' },
    },
  },
});
`,
    'tokens/global.tokens.json': `${JSON.stringify(
      {
        color: {
          $type: 'color',
          white: { $value: '#FFFFFF' },
          blue: { 500: { $value: '#3B82F6' }, 600: { $value: '#2563EB' }, 700: { $value: '#1D4ED8' } },
          gray: { 50: { $value: '#F9FAFB' }, 200: { $value: '#E5E7EB' }, 600: { $value: '#4B5563' }, 900: { $value: '#111827' } },
          red: { 600: { $value: '#DC2626' }, 700: { $value: '#B91C1C' } },
        },
        radius: { $type: 'dimension', sm: { $value: '4px' }, md: { $value: '8px' }, lg: { $value: '16px' } },
        space: {
          $type: 'dimension',
          1: { $value: '4px' },
          2: { $value: '8px' },
          3: { $value: '12px' },
          4: { $value: '16px' },
          6: { $value: '24px' },
        },
        font: {
          family: { $type: 'fontFamily', sans: { $value: 'system-ui, sans-serif' } },
          size: { $type: 'dimension', sm: { $value: '13px' }, md: { $value: '15px' }, lg: { $value: '18px' } },
          weight: { $type: 'fontWeight', regular: { $value: 400 }, medium: { $value: 500 } },
        },
      },
      null,
      2,
    )}\n`,
    'tokens/semantic.tokens.json': `${JSON.stringify(
      {
        color: {
          $type: 'color',
          primary: { $value: '{color.blue.600}', $description: 'Main brand color — the token brands most often override.' },
          'primary-hover': { $value: '{color.blue.700}' },
          'on-primary': { $value: '{color.white}' },
          text: { $value: '{color.gray.900}' },
          'text-muted': { $value: '{color.gray.600}' },
          background: { $value: '{color.white}' },
          surface: { $value: '{color.gray.50}' },
          'surface-hover': { $value: '{color.gray.200}' },
          border: { $value: '{color.gray.200}' },
          danger: { $value: '{color.red.600}' },
          'danger-hover': { $value: '{color.red.700}' },
        },
        radius: { $type: 'dimension', control: { $value: '{radius.md}' } },
        control: {
          $type: 'dimension',
          'padding-inline-sm': { $value: '{space.3}' },
          'padding-inline-md': { $value: '{space.4}' },
          'padding-inline-lg': { $value: '{space.6}' },
        },
        typography: {
          'body-family': { $type: 'fontFamily', $value: '{font.family.sans}' },
          'size-sm': { $type: 'dimension', $value: '{font.size.sm}' },
          'size-md': { $type: 'dimension', $value: '{font.size.md}' },
          'size-lg': { $type: 'dimension', $value: '{font.size.lg}' },
        },
      },
      null,
      2,
    )}\n`,
    'tokens/components/button.tokens.json': `${JSON.stringify(
      {
        button: {
          primary: {
            $type: 'color',
            background: { $value: '{color.primary}' },
            'background-hover': { $value: '{color.primary-hover}' },
            foreground: { $value: '{color.on-primary}' },
          },
          secondary: {
            $type: 'color',
            background: { $value: '{color.surface}' },
            'background-hover': { $value: '{color.surface-hover}' },
            foreground: { $value: '{color.text}' },
            border: { $value: '{color.border}' },
          },
          danger: {
            $type: 'color',
            background: { $value: '{color.danger}' },
            'background-hover': { $value: '{color.danger-hover}' },
            foreground: { $value: '{color.on-primary}' },
          },
          radius: { $type: 'dimension', $value: '{radius.control}' },
          size: {
            $type: 'dimension',
            sm: { height: { $value: '32px' } },
            md: { height: { $value: '40px' } },
            lg: { height: { $value: '48px' } },
          },
        },
      },
      null,
      2,
    )}\n`,
    [`brands/${brand}/tokens.json`]: '{}\n',
    'components/button.spec.ts': `import { defineSpec } from '@faravahar/girih';

export default defineSpec({
  name: 'Button',
  description: 'Triggers an action. Single-line label.',
  element: 'button',

  variants: {
    variant: { values: ['primary', 'secondary', 'danger'], default: 'primary' },
    size: { values: ['sm', 'md', 'lg'], default: 'md' },
  },
  states: ['hover', 'focus-visible', 'disabled', 'loading'],

  slots: { children: { required: true } },

  tokens: {
    base: {
      fontFamily: '{typography.body-family}',
      borderRadius: '{button.radius}',
    },
    variants: {
      variant: {
        primary: {
          background: '{button.primary.background}',
          color: '{button.primary.foreground}',
          states: { hover: { background: '{button.primary.background-hover}' } },
        },
        secondary: {
          background: '{button.secondary.background}',
          color: '{button.secondary.foreground}',
          borderColor: '{button.secondary.border}',
          states: { hover: { background: '{button.secondary.background-hover}' } },
        },
        danger: {
          background: '{button.danger.background}',
          color: '{button.danger.foreground}',
          states: { hover: { background: '{button.danger.background-hover}' } },
        },
      },
      size: {
        sm: { height: '{button.size.sm.height}', paddingInline: '{control.padding-inline-sm}', fontSize: '{typography.size-sm}' },
        md: { height: '{button.size.md.height}', paddingInline: '{control.padding-inline-md}', fontSize: '{typography.size-md}' },
        lg: { height: '{button.size.lg.height}', paddingInline: '{control.padding-inline-lg}', fontSize: '{typography.size-lg}' },
      },
    },
  },

  accessibility: {
    focusable: true,
    aria: { loading: { 'aria-busy': 'true' } },
  },
});
`,
    'demo/index.html': `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${name} — girih demo</title>
  <!-- Run \`girih generate react\` first; this page uses the generated stylesheets directly. -->
  <link rel="stylesheet" href="../packages/design-system/styles/tokens.css" />
  <link rel="stylesheet" href="../packages/design-system/styles/components.css" />
  <style>
    body { margin: 0; font-family: var(--ds-typography-body-family); color: var(--ds-color-text); background: var(--ds-color-background); }
    main { max-width: 640px; margin: 0 auto; padding: var(--ds-space-6); display: grid; gap: var(--ds-space-4); }
    h1 { font-size: var(--ds-font-size-lg); margin: 0; }
    p { margin: 0; color: var(--ds-color-text-muted); font-size: var(--ds-font-size-sm); }
    .row { display: flex; gap: var(--ds-space-2); flex-wrap: wrap; align-items: center; }
    label { display: flex; gap: var(--ds-space-2); align-items: center; font-size: var(--ds-font-size-sm); }
  </style>
</head>
<body>
  <main>
    <h1>${name}</h1>
    <p>Every button below is styled purely by the generated CSS — edit tokens/ or a brand overlay and regenerate.</p>
    <label><input type="checkbox" id="brand-toggle" disabled /> Alternate brand <small>(enable after <code>girih brand create</code>)</small></label>
    <div class="row">
      <button class="ds-button" data-variant="primary" data-size="sm">Save</button>
      <button class="ds-button" data-variant="primary" data-size="md">Save</button>
      <button class="ds-button" data-variant="primary" data-size="lg">Save</button>
    </div>
    <div class="row">
      <button class="ds-button" data-variant="secondary" data-size="md">Cancel</button>
      <button class="ds-button" data-variant="danger" data-size="md">Delete</button>
      <button class="ds-button" data-variant="primary" data-size="md" disabled>Disabled</button>
      <button class="ds-button" data-variant="primary" data-size="md" data-loading="true" aria-busy="true" disabled>Saving…</button>
    </div>
  </main>
  <script>
    // After \`girih brand create <name>\`: set the brand here and remove \`disabled\` above.
    const ALTERNATE_BRAND = '';
    const toggle = document.getElementById('brand-toggle');
    if (ALTERNATE_BRAND) toggle.disabled = false;
    toggle.addEventListener('change', (event) => {
      if (event.target.checked) document.documentElement.dataset.brand = ALTERNATE_BRAND;
      else delete document.documentElement.dataset.brand;
    });
  </script>
</body>
</html>
`,
    '.gitignore': `node_modules/
packages/
.ds/cache/
*.log
`,
  };
}

/** Write the template into dir; existing files are never overwritten. */
export async function scaffoldWorkspace(dir: string, options: ScaffoldOptions): Promise<ScaffoldResult> {
  const written: string[] = [];
  const skipped: string[] = [];
  for (const [path, contents] of Object.entries(workspaceTemplate(options))) {
    const absolute = join(dir, path);
    if (existsSync(absolute)) {
      skipped.push(path);
      continue;
    }
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents, 'utf8');
    written.push(path);
  }
  return { written, skipped };
}
