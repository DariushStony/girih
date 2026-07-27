# Changelog

All notable changes to girih. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[semantic versioning](https://semver.org/).

All eight published packages move in lockstep. Internal dependencies publish as exact
pins, so a change in `girih-core` cannot reach consumers without republishing everything
above it — the version is a property of the release, not of one package.

## 0.1.1 — 2026-07-27

### Breaking changes

- release automatically on push, no pull request (7ab3a7a)

### Features

- **girih-core:** give the config diagnostics a help line (61cd9e7)

### Bug fixes

- **ci:** refuse to guess a release version, and split the bump logic out (7d64d50)

## 0.1.0 — 2026-07-27

The first public release.

### Added

- **`girih create <directory>`** — makes a new workspace in a new directory, installs, and
  initialises it. `girih init` remains for a project that already has a `package.json`.
- **`girih doctor`** — diagnoses the environment rather than the workspace: node version
  against the real floor, package manager, whether the CLI resolves, build prerequisites,
  version skew across the internal pins, and an optional registry check. `girih check`
  validates what a workspace _contains_; `doctor` validates what it runs _in_.
- **`girih update`** — upgrades the `@faravahar/girih-*` packages in a workspace.
- **`invalid` component state** — one prop drives both `data-invalid` and `aria-invalid`,
  so a component cannot show an error style without announcing it.
- **CSS cascade layers** — emitted CSS lands in `@layer girih.tokens` and
  `@layer girih.components`. Consumer CSS is unlayered and therefore always wins, so
  overriding a generated component needs no specificity fight or `!important`.
- **Interactive `create-girih`** — run with no arguments it asks for the directory,
  package name, brand, and whether to install. Any flag skips its question.
- `girih --version` / `-v`, and `--version` / `-h` for `create-girih`.

### Changed

- **`girih forks`** was previously `girih update`. It reports ejected components that have
  drifted from their template; `update` now means upgrading the tooling, which is what
  people typed it expecting.
- **Node 22.22.1 or newer.** Not a preference: `style-dictionary` requires Node 22 and the
  toolchain requires 22.22.1. `.nvmrc` pins it and `engine-strict` enforces it at install.
- Declarations are emitted by `tsc` rather than tsup's bundled-dts pipeline, which
  hardcodes a `baseUrl` that TypeScript 6 rejects.

### Fixed

- **Config loading is safe under concurrency.** `jiti` cached transpiled config into a
  shared directory in the system temp dir, so two girih processes running at once — turbo
  across workspaces, or a parallel test suite — could read a half-written entry and fail
  with a syntax error in a file the user never wrote.
- **A scaffolded workspace can build.** `create-girih` wrote only the CLI, but generated
  components import react and the runtime, so the documented next step failed with four
  `TS2307`s. It now scaffolds the prerequisites, and `girih build` reports a single
  actionable `GIRIH6002` instead of a wall of compiler errors when they are missing.
- **The CLI no longer depends on esbuild**, whose `postinstall` pnpm 10+ blocks by default
  — which would have made `girih build` fail on a plain install.
