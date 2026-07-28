# Contributing to girih

Thanks for looking. This file is the short version of what you need to know before changing
anything. The long version is the [documentation](docs/md/index.md) — in particular
[chapter 06, The code](docs/md/06-the-code.md), which maps every concept onto a file.

## Setup

```bash
pnpm install      # also installs the husky hooks, via `prepare`
pnpm build        # required: several tests and all CLI usage run against dist/
pnpm verify       # build, typecheck, lint, format, tests, and the example's drift gate
```

You need Node 22.22.1+ and pnpm 11.17.0 (pinned via `packageManager`; `corepack enable` handles it).
`.nvmrc` has the exact version and `.npmrc` sets `engine-strict`, so the wrong Node fails at install
rather than somewhere confusing later. The floor is not a preference: `lint-staged` requires
22.22.1 and `style-dictionary` requires 22.

A pre-commit hook runs `lint-staged` (oxlint `--fix` then Prettier on staged files), and a
`commit-msg` hook runs commitlint. Both ignore every generated path; see below.

## The invariants

These are not style preferences. Breaking one is a design bug, and a reviewer will ask you to
change the approach rather than the code.

1. **Generated output is never hand-edited.** Anything under `examples/*/packages/`, `styles/`,
   `dist/`, or `.ds/ir/` is emitted. If it looks wrong, fix the generator or the contract.
   `.ds/manifest.json` will catch you.

2. **Brands are skins, never forks.** A brand overlay may only override token paths that already
   exist. Introducing a path is a hard error, and `validateBrandParity()` enforces the same
   invariant from the other side.

3. **Tier references flow downward only:** component → semantic → global. Never sideways, never up.

4. **Every design value in emitted CSS is a `var()`.** Component CSS carries structure only.
   Aliases stay live — never flattened to literals — so nested `[data-brand]` scopes rebrand at
   runtime with no rebuild.

5. **Contracts are data, not code.** `defineSpec` is authored in TypeScript for editor ergonomics
   and validated as pure data. No function values, no runtime imports, no environment branching.

6. **`generate`, `build` and `publish` must never disagree** about what the package contains. All
   three route through `composeReact()` in [`packages/girih/src/workspace.ts`](packages/girih/src/workspace.ts).
   Extend that one function, not the three call sites.

7. **Semver comes from the contract diff, not judgement.** Token value = patch, new variant =
   minor, anything removed = major. See [`packages/girih/src/semver.ts`](packages/girih/src/semver.ts).

## The dependency direction

```
core  ←  tokens  ←  generator-css
core, tokens  ←  spec  ←  generator-react
                                     ↖ core
core, tokens, spec, generator-css, generator-react  ←  cli
```

`react-runtime`, `create-girih` and `figma` are standalone. `react` is a **peer** dependency of
`react-runtime`, never a real one. `create-girih` has zero workspace dependencies because it must
run before anything is installed.

Nothing enforces this mechanically — no lint rule, no dependency-cruiser config. If a fix seems to
need an upward import, the logic belongs lower down or in `core`. An upward import is never the
answer.

## Diagnostics, not exceptions

girih almost never throws. A user-facing problem is a `Diagnostic` with a stable code, a severity,
the file and path it concerns, and — for anything actionable — a one-line `help`.

Codes are partitioned by owning package. Stay in your range and never reuse a retired number;
somebody's CI filter or runbook is still matching the old meaning. Gaps are free, collisions are not.

| Range       | Owner             | Covers                                                   |
| ----------- | ----------------- | -------------------------------------------------------- |
| `GIRIH1xxx` | `core`, `cli`     | Config, workspace, manifest/drift, `ds.lock`             |
| `GIRIH2xxx` | `tokens`          | Parse, overlay, alias resolution, tier validation        |
| `GIRIH3xxx` | `generator-css`   | CSS emission, var-name collisions, unserializable values |
| `GIRIH4xxx` | `spec`            | Contract shape, token refs, states, extensions           |
| `GIRIH5xxx` | `generator-react` | React emission                                           |
| `GIRIH6xxx` | `cli`             | Build and publish                                        |

When you add a diagnostic:

- Put it in your package's range.
- Include a `help` line. Roughly half the existing codes lack one — that is a known gap, not a
  precedent.
- Add a test asserting the **code**, not the message text. Messages should be free to improve.
- Regenerate the reference: `node docs/scripts/extract-diagnostics.mjs`.

## Emitting files

Everything that writes a file goes through `@faravahar/girih-core`:

```ts
import { emittedFile, writeEmittedFiles, verifyEmittedFiles } from '@faravahar/girih-core';
```

`emittedFile()` computes the SHA-256 that drift detection, the `--check` gate, and publish diffing
all depend on. Three code paths that hash differently is precisely the bug class this architecture
exists to prevent. Likewise, every CSS variable name comes from `cssVarName()` — `tokens.css`,
`tokens.d.ts` and `components.css` must agree or the output silently breaks.

## Verifying a change

Smallest scope that proves it:

| Change                                   | Verification                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| One package's internals                  | `pnpm vitest run packages/<pkg>` then `pnpm typecheck`                                     |
| Token engine or CSS generator            | above, plus `pnpm example:check`                                                           |
| Contract, validation, or React templates | above, plus `pnpm example:drift`                                                           |
| CLI behaviour                            | `pnpm build` first — `cli` is **not** source-aliased in vitest — then exercise the command |
| Packaging or `dist/` shape               | `pnpm test` including `e2e/test/consumer.test.ts` (slow; packs real tarballs)              |

`pnpm verify` is the whole gate — build, typecheck, lint, `format:check`, tests, then the example's
`girih check` and drift check, plus the docs gate. It is the same set `ci` runs, so a green verify
means a green pipeline.

`exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on and will reject code that looks
fine.

Never run `girih publish --yes` — that publishes a _consumer's_ design system, not girih. girih's
own release is a merged release PR; see below.

### Tests must not depend on the network

The suite gates releases, so nothing in it may depend on the registry being up or on what is
currently published. girih is spawned with `GIRIH_NO_UPDATE_CHECK=1` in the e2e helpers, and
`girih doctor --offline` skips its update check. Keep it that way.

## Never format generated output

`.prettierignore` and `.oxlintrc.json` both exclude every emitted path —
`examples/*/{packages,styles,.ds}/`, `docs/*.html`, `docs/md/`, `docs/data/`. This is load-bearing,
not tidiness: `.ds/manifest.json` stores a hash per emitted file, so reformatting one registers as
drift that the next `girih generate` reverts, and any diff under `docs/` fails the docs stage. If
you add a generator, add its output to both files.

## Documentation

The docs are generated. Edit `docs/scripts/pages/*.mjs`, never `docs/*.html` or `docs/md/*.md`.

```bash
pnpm docs:generate  # the whole chain, in the only order that works
```

That expands to `pnpm build` → `girih generate react` in the example → the two extractors →
`build-docs`. The middle step is easy to forget and not optional: the extractors read the example's
emitted CSS, which is gitignored, so they fail or go stale without it. For a prose-only edit,
`pnpm docs:build` alone is enough — it reads the already-committed `docs/data/*.json`.

Commit the result: `docs/*.html`, `docs/md/*.md`, `docs/README.md`, and `docs/data/*.json`. The Pages
workflow regenerates and fails on any diff, so a stale `docs/` blocks the deploy.

Every value quoted in the documentation is extracted by running girih's own engine over the example
workspace. Please keep it that way — if you need a value in prose, extract it rather than typing it,
so it cannot go stale.

## Releasing girih

Nothing about a release is typed by hand. The version comes from the commits.

That is deliberate: girih's seventh invariant says a version comes from the contract diff
rather than judgement, and `girih publish` enforces it for a consumer's design system. This is
the same rule turned on girih itself.

**How it works**

You push to `main` with conventional commit subjects. That is the whole workflow.

`release.yml` runs `ci` → `docs` → `release`. If the commits since the last `v*` tag warrant
a release, the last stage computes the version, applies every edit, publishes to npm, then
pushes the bump commit and the `vX.Y.Z` tag. A `git pull` afterwards brings both down.

If nothing warrants a release the pipeline still passes — it just stops after the plan.

Locally, `pnpm release:plan` shows what the next release would be and writes nothing.
`pnpm release:prepare` applies the edits, if you ever need to do it by hand.

**What determines the bump**

| Commit                                              | Bump                          |
| --------------------------------------------------- | ----------------------------- |
| `feat:`                                             | minor                         |
| `fix:` `perf:` `revert:`                            | patch                         |
| `build:`                                            | patch — it changes what ships |
| `!` or a `BREAKING CHANGE:` footer                  | major                         |
| `docs:` `chore:` `test:` `ci:` `style:` `refactor:` | none                          |

A commit also has to be able to _reach_ a consumer, which the type alone does not tell you.
Two gates apply on top of the table:

- **Scope.** `ci` `docs` `e2e` `examples` `release` name things girih does not publish, so
  they never release. `deps` does, because a dependency change alters the published tree. A
  scopeless commit releases, since repo-wide could mean anything.
- **Type.** `ci` `test` `style` `docs` never reach a consumer whatever markers they carry —
  so `ci!:` is not a major. `refactor!:` is, because refactors touch shipped code.

Without those, `fix(ci): give the e2e suites a timeout` would have published a release whose
`dist` was byte-identical to the one before it.

Below 1.0 the result is then remapped by girih's own pre-1.0 rule — breaking moves the
minor, a feature moves the patch — using the same logic as
[`packages/girih/src/semver.ts`](packages/girih/src/semver.ts). A test asserts the two agree,
so they cannot drift.

**Things worth knowing**

- **pnpm, never npm.** Five packages depend on each other by `workspace:*`. `pnpm publish`
  rewrites those to real versions; `npm publish` copies them verbatim and every consumer
  install dies with `EUNSUPPORTEDPROTOCOL`. `pnpm pack` in a package directory is fine;
  `npm pack` is not.
- **All eight move together.** The rewrite produces an _exact_ pin, so a change in `core`
  cannot reach consumers without republishing everything above it. The tooling does this;
  do not bump one package alone.
- **A version is permanent.** npm never allows reuse, so `release.yml` refuses a version
  that already exists rather than publishing the packages that come earlier in the
  topological order and leaving the release half-done.
- **`@faravahar/girih-figma` never publishes.** It is `private: true`, a phase-2 stub, and the
  tooling skips it. Its version stays `0.0.0` on purpose.
- **A missing tag stops the release rather than guessing.** The version is measured from
  the last `v*` tag; without one there is no way to know what already shipped, so
  release-prepare refuses instead of assuming every commit is unreleased. If it complains,
  a tag was created locally and never pushed: `git push origin --tags`.
- To hold a release back, do not merge the releasable commit yet. There is no PR to park.

## Commits

Conventional commits, enforced by commitlint via a husky `commit-msg` hook:

```
feat(cli): add girih doctor
fix(tokens): reject an upward tier reference
```

Scopes are the package directory names, plus `docs`, `e2e`, `examples`, `release`, `deps` and `ci`. A change spanning several packages omits the scope. Earlier history
uses milestone subjects (`M6: …`); those are no longer valid. Keep the subject a summary of intent
rather than a file list, and put the reasoning in the body.

## Things to ask before doing

- Changing the package manager or `tsconfig.base.json` compiler options
- Growing `@faravahar/girih-figma` beyond its stub
- Publishing to npm, or changing what the release publishes
- Adding a new top-level package

## Comments

Comments in this codebase carry **rationale**, not description — why a gate exists, why an ordering
matters. Preserve them. If you change the mechanism a comment explains, update the comment in the
same edit.
