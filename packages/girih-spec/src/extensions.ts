import { createJiti } from 'jiti';
import { join } from 'node:path';
import { glob } from 'tinyglobby';
import type { Diagnostic, ResolvedConfig } from '@faravahar/girih-core';
import type { ResolvedTokenGraph } from '@faravahar/girih-tokens';
import { kebabCase } from './ir.js';
import type { ComponentIR, VariantExtensionInput } from './types.js';

/** PascalCase component name → its token namespace (Button → button). No vendor-prefix rule here. */
const componentNamespace = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

const EXTENSION_BRAND = Symbol.for('girih.variant-extension');
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;
const REF_SHAPE = /^\{([^{}]+)\}$/;

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
      const match = REF_SHAPE.exec(ref);
      if (!match) {
        diagnostics.push({
          code: 'GIRIH4012',
          severity: 'error',
          message: `Extension '${extension.name}' has a malformed token reference '${ref}' at ${property} — expected '{token.path}'.`,
          file,
          path: property,
          help: 'A reference is one token path in braces: `{color.action}`. No nesting, no fallback value, no spaces.',
        });
        continue;
      }
      const path = match[1]!;
      const missing = [...graphs.keys()].filter((brand) => !graphs.get(brand)!.tokens.get(path));
      if (missing.length > 0) {
        diagnostics.push({
          code: 'GIRIH4002',
          severity: 'error',
          message: `Extension '${extension.name}' references '{${path}}', which ${
            missing.length === graphs.size ? 'no brand resolves' : `brand(s) ${missing.join(', ')} do not resolve`
          }.`,
          file,
          path: property,
          help: 'Every brand must resolve the same token set, so the token has to exist in the base tokens — a brand overlay may override paths but never introduce them.',
        });
        continue;
      }

      // Same tier discipline as specs: extensions consume semantic tokens or
      // their base component's own tokens — never raw globals, never another
      // component's plumbing.
      const token = [...graphs.values()][0]?.tokens.get(path);
      if (token?.tier === 'global') {
        diagnostics.push({
          code: 'GIRIH4003',
          severity: 'warning',
          message: `Extension '${extension.name}' references global token '{${path}}' — extensions should consume semantic or component tokens.`,
          file,
          path: property,
          help: 'Add a semantic token that aliases this global one and reference that instead. An extension bound straight to a global value cannot be re-themed per brand.',
        });
      } else if (token?.tier === 'component' && path.split('.')[0] !== componentNamespace(extension.extends)) {
        diagnostics.push({
          code: 'GIRIH4038',
          severity: 'warning',
          message: `Extension '${extension.name}' reaches into '{${path}}', another component's token namespace.`,
          file,
          path: property,
          help: `Use semantic tokens or '${componentNamespace(extension.extends)}.*' tokens so the extension survives refactors of unrelated components.`,
        });
      }
    }
  }
  return diagnostics;
}
