import { createRequire } from 'node:module';

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
