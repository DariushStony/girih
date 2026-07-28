import { createRequire } from 'node:module';
import pc from 'picocolors';

/**
 * The CLI's own name and version.
 *
 * Read at runtime rather than with an import attribute: the bundler inlines a JSON
 * import wholesale, which would ship this package's devDependency list inside dist/.
 */
export const { name: PACKAGE_SELF, version: SELF_VERSION } = createRequire(import.meta.url)('../package.json') as {
  name: string;
  version: string;
};

/** Published alongside the CLI at the same version — the workspace is lockstep. */
export const RUNTIME_PACKAGE = '@faravahar/girih-react-runtime';

/** A brand name becomes a `[data-brand]` selector, so it must be a valid CSS ident. */
export const BRAND_NAME = /^[a-z][a-z0-9-]*$/;
export const PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** Prints the shared error and sets a failing exit code — shared so `create`, `init`, and `brand create` can never disagree on what a valid name is. */
export function validateBrandName(name: string): boolean {
  if (BRAND_NAME.test(name)) return true;
  console.error(pc.red(`Brand name '${name}' must be lowercase kebab-case (it becomes a [data-brand] selector).`));
  process.exitCode = 1;
  return false;
}

/** `derivedFromDirectory` prints a hint toward `--name` — only meaningful when the caller didn't pass one explicitly. */
export function validatePackageName(name: string, derivedFromDirectory: boolean): boolean {
  if (PACKAGE_NAME.test(name)) return true;
  console.error(pc.red(`'${name}' is not a valid npm package name.`));
  if (derivedFromDirectory) console.error(pc.dim(`(derived from the directory name — pass --name @scope/design-system explicitly)`));
  process.exitCode = 1;
  return false;
}
