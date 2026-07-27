/**
 * Conventional commits. The repo's earlier milestone-style subjects (`M6: packaging
 * and publish — …`) are not valid conventional types and are not accepted going
 * forward; history keeps them.
 *
 * Subject length is raised from the default 100 because scoped package names here are
 * long (`fix(generator-react): …`) and a truncated subject is worse than a wide one.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 120],
    'body-max-line-length': [2, 'always', 100],
    'scope-enum': [
      1,
      'always',
      [
        'cli',
        'core',
        'tokens',
        'spec',
        'generator-css',
        'generator-react',
        'react-runtime',
        'create-girih',
        'figma',
        'docs',
        'e2e',
        'release',
        'deps',
      ],
    ],
  },
};
