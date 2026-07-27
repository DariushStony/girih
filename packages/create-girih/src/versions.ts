/**
 * Version ranges create-girih writes into a scaffolded workspace.
 *
 * Its own module so tests can read them without importing cli.ts, which runs
 * the scaffold on import. Kept dependency-free: create-girih must install
 * before anything else exists.
 */

/**
 * Range for the CLI in the scaffolded devDependencies. `^0.x` admits only that
 * one minor, so publishing create-girih at a version the CLI has moved past
 * makes `npx create-girih` fail at its own install step — after it has already
 * written package.json, and a re-run refuses the non-empty directory.
 * test/versions.test.ts pins this to the CLI's real version.
 */
export const CLI_VERSION_RANGE = '^0.1.0';
