/**
 * Version ranges create-girih writes into a scaffolded workspace.
 *
 * Its own module so tests can read them without importing cli.ts, which scaffolds
 * on import. Deliberately dependency-free and deliberately duplicating the
 * generator's runtime range: create-girih must install before any @faravahar/*
 * package exists, so it cannot import the constant it has to agree with.
 * test/versions.test.ts is what keeps the two honest.
 */

/**
 * Range for the CLI in the scaffolded devDependencies. `^0.x` admits only that
 * one minor, so publishing create-girih at a version the CLI has moved past
 * makes `npx create-girih` fail at its own install step — after it has already
 * written package.json, and a re-run refuses the non-empty directory.
 */
export const CLI_VERSION_RANGE = '^0.3.0';

/** Must match generator-react's RUNTIME_VERSION_RANGE: generated components import it. */
export const RUNTIME_VERSION_RANGE = '^0.3.0';

/** React is a peer of the generated package; @types/react is what `girih build` compiles against. */
export const REACT_VERSION_RANGE = '^19.0.0';

/**
 * A generated workspace needs more than the CLI: `girih generate react` emits
 * components importing react and the runtime, and `girih build` type-checks them.
 * Scaffolding only the CLI left the documented next step failing with four TS2307s.
 *
 * react-dom is deliberately absent — the scaffolded demo page needs no bundler and
 * no renderer, and `girih build` only needs types plus react/jsx-runtime.
 */
export function scaffoldDevDependencies(useWorkspaceProtocol: boolean): Record<string, string> {
  // --workspace links the girih packages through the pnpm workspace protocol for
  // development inside the monorepo; published ranges are the default.
  const girih = useWorkspaceProtocol ? 'workspace:*' : null;
  return {
    '@faravahar/girih': girih ?? CLI_VERSION_RANGE,
    '@faravahar/girih-react-runtime': girih ?? RUNTIME_VERSION_RANGE,
    '@types/react': REACT_VERSION_RANGE,
    react: REACT_VERSION_RANGE,
  };
}
