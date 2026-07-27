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
   three route through `composeReact()` in [`packages/girih/src/cli.ts`](packages/girih/src/cli.ts).
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
| Token engine or CSS generator            | above, plus `cd examples/acme-ds && pnpm exec girih check`                                 |
| Contract, validation, or React templates | above, plus `pnpm exec girih generate react --check`                                       |
| CLI behaviour                            | `pnpm build` first — `cli` is **not** source-aliased in vitest — then exercise the command |
| Packaging or `dist/` shape               | `pnpm test` including `e2e/test/consumer.test.ts` (slow; packs real tarballs)              |

`pnpm verify` is the whole gate — build, typecheck, lint, `format:check`, tests, then the example's
`girih check` and drift check. It is what `pnpm release` runs first, so if it passes locally the
release will not fall over on something mechanical.

`exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on and will reject code that looks
fine.

Never run `girih publish --yes` — that publishes a _consumer's_ design system, not girih. girih's
own release is `pnpm release`; see below.

### Tests must not depend on the network

The suite gates releases, so nothing in it may depend on the registry being up or on what is
currently published. girih is spawned with `GIRIH_NO_UPDATE_CHECK=1` in the e2e helpers, and
`girih doctor --offline` skips its update check. Keep it that way.

## Never format generated output

`.prettierignore` and `.oxlintrc.json` both exclude every emitted path —
`examples/*/{packages,styles,.ds}/`, `docs/*.html`, `docs/md/`, `docs/data/`. This is load-bearing,
not tidiness: `.ds/manifest.json` stores a hash per emitted file, so reformatting one registers as
drift that the next `girih generate` reverts, and any diff under `docs/` fails the Pages workflow. If
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

Eight packages publish, lockstep, from `main`. `@faravahar/girih-figma` is `private: true` and does
not.

```bash
pnpm release        # verify → pack:verify → pnpm -r publish --access public
```

Read this before running it:

- **pnpm, never npm.** Five packages depend on each other by `workspace:*`. `pnpm publish` rewrites
  those to real versions; `npm publish` copies them verbatim and every consumer install dies with
  `EUNSUPPORTEDPROTOCOL`. `pnpm pack` in a package directory is fine; `npm pack` is not.
- **Versions move together.** The rewrite produces an _exact_ pin (`"…-core": "0.1.0"`), so a change
  in `core` cannot reach consumers without republishing everything above it. Bump all eight.
- **Bumping is three files, not one.** The eight `version` fields, plus
  `generator-react/src/generate.ts`'s `RUNTIME_VERSION_RANGE` and `create-girih/src/versions.ts`.
  Those two ranges ship inside published code — one of them into a package _consumers_ publish — and
  `^0.x` admits a single minor. Tests assert both against the real versions, so a forgotten one fails
  rather than shipping.
- **`pnpm pack:verify` is not optional.** `dist/` is gitignored, so a clean clone can pack tarballs
  containing nothing but `package.json` — silently. npm never lets a version be reused, so that
  mistake is permanent. The script packs all eight and checks the archives.
- Publishing needs a clean tree (`pnpm publish` refuses otherwise) and an npm token with publish
  rights on the `faravahar` scope.

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
