# Contributing to girih

Thanks for looking. This file is the short version of what you need to know before changing
anything. The long version is the [documentation](docs/md/index.md) — in particular
[chapter 06, The code](docs/md/06-the-code.md), which maps every concept onto a file.

## Setup

```bash
pnpm install
pnpm build        # required: several tests and all CLI usage run against dist/
pnpm test
```

You need Node 20+ and pnpm 11.8.0 (pinned via `packageManager`; `corepack enable` handles it).

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
   three route through `composeReact()` in [`packages/cli/src/cli.ts`](packages/cli/src/cli.ts).
   Extend that one function, not the three call sites.

7. **Semver comes from the contract diff, not judgement.** Token value = patch, new variant =
   minor, anything removed = major. See [`packages/cli/src/semver.ts`](packages/cli/src/semver.ts).

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

| Range | Owner | Covers |
| --- | --- | --- |
| `GIRIH1xxx` | `core`, `cli` | Config, workspace, manifest/drift, `ds.lock` |
| `GIRIH2xxx` | `tokens` | Parse, overlay, alias resolution, tier validation |
| `GIRIH3xxx` | `generator-css` | CSS emission, var-name collisions, unserializable values |
| `GIRIH4xxx` | `spec` | Contract shape, token refs, states, extensions |
| `GIRIH5xxx` | `generator-react` | React emission |
| `GIRIH6xxx` | `cli` | Build and publish |

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

| Change | Verification |
| --- | --- |
| One package's internals | `pnpm vitest run packages/<pkg>` then `pnpm typecheck` |
| Token engine or CSS generator | above, plus `cd examples/acme-ds && pnpm exec girih check` |
| Contract, validation, or React templates | above, plus `pnpm exec girih generate react --check` |
| CLI behaviour | `pnpm build` first — `cli` is **not** source-aliased in vitest — then exercise the command |
| Packaging or `dist/` shape | `pnpm test` including `e2e/test/consumer.test.ts` (slow; packs real tarballs) |

There is **no linter and no formatter**. Verification is `pnpm typecheck` and `pnpm test`. Both
must pass. `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on and will reject code
that looks fine.

Never run `girih publish --yes`.

### Known flake

`e2e/test/consumer.test.ts` intermittently fails with `ENOENT … e2e/.tmp/consumer/app/smoke.mjs`.
`e2e/test/workspace.test.ts` removes all of `e2e/.tmp` in its `afterAll`, while `consumer.test.ts`
keeps its scratch under `e2e/.tmp/consumer` — and vitest runs the two files in parallel, so a
teardown can delete a live sibling's directory. Re-run, or run the file alone. It is not your
change. The fix, for whoever wants it, is to scope that teardown to `e2e/.tmp/e2e-ds` and
`e2e/.tmp/bad-brand`.

## Documentation

The docs are generated. Edit `docs/scripts/pages/*.mjs`, never `docs/*.html` or `docs/md/*.md`.

```bash
pnpm build
node docs/scripts/extract-tokens.mjs        # real token graphs from examples/acme-ds
node docs/scripts/extract-diagnostics.mjs   # every GIRIH code, from source
node docs/scripts/build-docs.mjs            # → docs/*.html + docs/md/*.md
```

Every value quoted in the documentation is extracted by running girih's own engine over the example
workspace. Please keep it that way — if you need a value in prose, extract it rather than typing it,
so it cannot go stale.

## Commits

This repository uses milestone-style subjects:

```
M6: packaging and publish — compiled dist, contract-diff semver
```

There is no commitlint. Match the existing style, keep the subject a summary of intent rather than
a file list, and put the reasoning in the body.

## Things to ask before doing

- Adding a linter, formatter, or CI config
- Changing the package manager or `tsconfig.base.json` compiler options
- Growing `@faravahar/girih-figma` beyond its stub
- Publishing anything to npm
- Adding a new top-level package

## Comments

Comments in this codebase carry **rationale**, not description — why a gate exists, why an ordering
matters. Preserve them. If you change the mechanism a comment explains, update the comment in the
same edit.
