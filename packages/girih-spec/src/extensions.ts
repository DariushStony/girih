import { createJiti } from 'jiti';
import { join } from 'node:path';
import { glob } from 'tinyglobby';
import { kebabName } from '@faravahar/girih-core';
import type { Diagnostic, ResolvedConfig } from '@faravahar/girih-core';
import type { ResolvedTokenGraph } from '@faravahar/girih-tokens';
import { kebabCase, PASCAL_CASE } from './ir.js';
import { resolveTokenRef } from './token-ref.js';
import type { ComponentIR, VariantExtensionInput } from './types.js';

const EXTENSION_BRAND = Symbol.for('girih.variant-extension');

/**
 * The controlled 10%: a workspace-owned restyling of a catalog component.
 * Pure data, compiled at generate time — the zero-runtime CSS strategy and
 * the governance model both depend on extensions living in the workspace.
 */
export function defineVariant(extension: VariantExtensionInput): VariantExtensionInput {
  return Object.defineProperty({ ...extension }, EXTENSION_BRAND, { value: true, enumerable: false });
}

export function isVariantExtension(value: unknown): value is VariantExtensionInput {
  return typeof value === 'object' && value !== null && EXTENSION_BRAND in value;
}

export interface LoadedExtension {
  file: string;
  extension: VariantExtensionInput;
}

export async function loadExtensions(config: ResolvedConfig): Promise<{ extensions: LoadedExtension[]; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const extensions: LoadedExtension[] = [];
  const files = (await glob([config.components.extensions], { cwd: config.root })).sort();
  const jiti = createJiti(import.meta.url);

  for (const file of files) {
    try {
      const mod = await jiti.import<{ default?: unknown }>(join(config.root, file));
      const exported = (mod as { default?: unknown }).default ?? mod;
      if (!isVariantExtension(exported)) {
        diagnostics.push({
          code: 'GIRIH4030',
          severity: 'error',
          message: `${file} does not default-export a variant extension.`,
          file,
          help: "Export the result of defineVariant({ name, extends, tokens }) from '@faravahar/girih'.",
        });
        continue;
      }
      extensions.push({ file, extension: exported });
    } catch (error) {
      diagnostics.push({
        code: 'GIRIH4031',
        severity: 'error',
        message: `Failed to load extension: ${(error as Error).message}`,
        file,
        help: 'The extension is evaluated as real TypeScript, so a syntax error, an unresolved import, or a throw at module scope all land here.',
      });
    }
  }
  return { extensions, diagnostics };
}

/**
 * The extension contract: extends an extensible component, touches only the
 * CSS properties its spec lists as overridable, and every reference resolves
 * in every brand.
 */
export function validateExtensions(
  extensions: LoadedExtension[],
  irs: ComponentIR[],
  graphs: Map<string, ResolvedTokenGraph>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const byName = new Map(irs.map((ir) => [ir.name, ir]));
  // Runtime re-exports share the generated index's namespace with components and extensions.
  const claimed = new Set([...irs.map((ir) => ir.name), 'BrandProvider', 'useBrand', 'cx']);

  for (const { file, extension } of extensions) {
    if (!PASCAL_CASE.test(extension.name)) {
      diagnostics.push({
        code: 'GIRIH4032',
        severity: 'error',
        message: `Extension name '${extension.name}' must be PascalCase (it becomes an exported React identifier).`,
        file,
        help: 'The name becomes the exported React identifier, so it has to start with a capital. The .ext.ts file itself stays kebab-case.',
      });
      continue;
    }
    if (claimed.has(extension.name)) {
      diagnostics.push({
        code: 'GIRIH4033',
        severity: 'error',
        message: `Extension '${extension.name}' collides with an existing component or extension.`,
        file,
        help: 'Every component and extension shares one export namespace, because they all become named exports of the same package. Rename this one.',
      });
      continue;
    }
    claimed.add(extension.name);

    const base = byName.get(extension.extends);
    if (!base) {
      diagnostics.push({
        code: 'GIRIH4034',
        severity: 'error',
        message: `Extension '${extension.name}' extends '${extension.extends}', which is not in the component catalog.`,
        file,
        help: `Known components: ${[...byName.keys()].join(', ') || '(none)'}.`,
      });
      continue;
    }
    if (!base.extensibility.allowExtends) {
      diagnostics.push({
        code: 'GIRIH4035',
        severity: 'error',
        message: `'${extension.extends}' does not allow extensions (extensibility.allowExtends is false).`,
        file,
        help: 'Set extensibility.allowExtends: true on the base contract, if extending it is genuinely intended.',
      });
      continue;
    }
    if (base.template === 'dialog') {
      diagnostics.push({
        code: 'GIRIH4037',
        severity: 'error',
        message: `'${extension.extends}' is a compound (dialog) component — extensions can only build on single-element components.`,
        file,
        help: 'A compound component emits several parts, so there is no single element for a wrapper to forward props to. Extend one of the single-element components instead.',
      });
      continue;
    }

    const overridable = new Set(base.extensibility.overridableTokens.map((p) => kebabCase(p)));
    for (const [property, ref] of Object.entries(extension.tokens)) {
      const kebab = kebabCase(property);
      if (!overridable.has(kebab)) {
        diagnostics.push({
          code: 'GIRIH4036',
          severity: 'error',
          message: `Extension '${extension.name}' overrides '${property}', which '${extension.extends}' does not list under extensibility.overridableTokens.`,
          file,
          path: property,
          help: `Overridable: ${base.extensibility.overridableTokens.join(', ') || '(none)'}.`,
        });
        continue;
      }
      // Same tier discipline as specs: extensions consume semantic tokens or
      // their base component's own tokens — never raw globals, never another
      // component's plumbing.
      diagnostics.push(
        ...resolveTokenRef(ref, graphs, {
          subject: `Extension '${extension.name}'`,
          ownNamespace: kebabName(extension.extends),
          file,
          where: property,
        }),
      );
    }
  }
  return diagnostics;
}
