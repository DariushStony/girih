/**
 * Conventional commits. The repo's earlier milestone-style subjects (`M6: packaging
 * and publish — …`) are not valid conventional types and are not accepted going
 * forward; history keeps them.
 *
 * Subject length is raised from the default 100 because scoped package names here are
 * long (`fix(girih-generator-react): …`) and a truncated subject is worse than a wide one.
 */

/**
 * One scope per package directory, so the scope names what you can `cd` into and there
 * is no mapping to remember. A change spanning several packages omits the scope rather
 * than inventing an umbrella one — `feat: …` is correct for a cross-package change.
 */
const PACKAGE_SCOPES = [
  'girih',
  'girih-core',
  'girih-tokens',
  'girih-spec',
  'girih-generator-css',
  'girih-generator-react',
  'girih-react-runtime',
  'girih-figma',
  'create-girih',
];

/** Areas that are not packages but are still worth scoping. */
const AREA_SCOPES = ['docs', 'e2e', 'examples', 'release', 'deps', 'ci'];

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 120],
    'body-max-line-length': [2, 'always', 100],
    // A warning, not an error: an unlisted scope is usually a sign a new package
    // exists, and that should not be discovered by a blocked commit.
    'scope-enum': [1, 'always', [...PACKAGE_SCOPES, ...AREA_SCOPES]],
  },
};
