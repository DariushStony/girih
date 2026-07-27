# graphify

- **graphify** (`.claude/skills/graphify/SKILL.md`) — any input to knowledge graph. Trigger: `/graphify`
  When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.

This project has a knowledge graph at `graphify-out/` with god nodes, community structure, and cross-file relationships (1,961 nodes · 2,643 edges · 149 communities, built from 245 files).

Rules:

- For codebase questions, first run `graphify query "<question>"` when `graphify-out/graph.json` exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of raw source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- `graphify-out/` is gitignored. It is a local index, never a build artifact — never commit it, never cite it as project documentation.

# Project Overview

**girih** (گره) is design system **infrastructure**, not a component library. It is a pnpm/turbo monorepo of nine packages that compile a declared design language — DTCG tokens, brand overlays, component contracts — into governed, versioned, publishable artifacts.

```
tokens/ + brands/ + components/   ──girih generate──▶   @acme/design-system
        (source of truth)                               (build artifact, never hand-edited)
```

Nothing here is deployed. The deliverables are npm packages (`@faravahar/girih*`, `create-girih`) plus the `girih` / `ds` CLI. `examples/acme-ds/` is a real consumer workspace used as the working demo, and `e2e/` proves the packed tarball installs and server-renders in a fresh consumer.

Milestones M1–M6 are functional. Read `README.md` for what each milestone delivered; it is accurate and current.

# Tech Stack

- **Language:** TypeScript 6.0, ESM only (`"type": "module"` everywhere), Node ≥ 22.22.1 (`.nvmrc`, `engine-strict`)
- **Structure:** pnpm workspace (`packages/*`, `examples/*`, `e2e`) + turbo for `build` / `typecheck`
- **Package manager:** pnpm 11.17.0 (corepack-managed via `package.json#packageManager`)
- **Bundler:** tsup per package for JS (`--format esm --sourcemap --clean`), then `tsc -p tsconfig.build.json` for `.d.ts` — tsup's bundled-dts pipeline hardcodes the deprecated `baseUrl`. esbuild for the React demo bundle
- **Tests:** vitest 4, single root config (`vitest.config.ts`), no per-package vitest config
- **Type config:** `tsconfig.base.json` — `NodeNext` module + resolution, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedModules`, `noEmit`
- **CLI:** commander + picocolors; config loading via jiti; token pipeline uses style-dictionary; file globbing via tinyglobby
- **Headless primitives:** `@base-ui-components/react` (Dialog only, behind a swappable adapter)
- **Quality tooling:** Prettier + oxlint (`.oxlintrc.json`), husky + lint-staged pre-commit, commitlint. Conventional commit _types_ drive the release version, so the subject line is load-bearing, not cosmetic. Verification is `pnpm verify` — build, typecheck, lint, format:check, tests, then the example's `girih check` and drift gate.
- **Commits are conventional** (`feat(cli): …`, `fix(tokens): …`), enforced by commitlint. The older milestone subjects (`M6: …`) stay in history but are no longer valid.

> **The ignore lists are load-bearing.** `.prettierignore` and `.oxlintrc.json` both exclude every generated path — `examples/*/{packages,styles,.ds}/`, `docs/*.html`, `docs/md/`, `docs/data/`. Formatting a generated file registers as drift that the next `girih generate` reverts, and the docs stage hard-fails on any `docs/` diff. If you add a generator, add its output to both.

# Architecture

**Package dependency direction** — enforced by nothing but review. Do not violate it.

```
core  ←  tokens  ←  generator-css
core, tokens  ←  spec  ←  generator-react
                                     ↖ core
core, tokens, spec, generator-css, generator-react  ←  cli
```

- `@faravahar/girih-core` — shared kernel: workspace config loading, `Diagnostic`/`DiagnosticBag`, the `EmittedFile` model (`emittedFile`, `writeEmittedFiles`, `verifyEmittedFiles`), `cssVarName`. Depends on nothing in the workspace.
- `@faravahar/girih-tokens` — the whole token pipeline: DTCG parse → brand merge → alias resolve → tier validation. May only depend on `core`.
- `@faravahar/girih-generator-css` — token graphs → multi-brand CSS custom properties + `TokenPath` types. May depend on `core` + `tokens`.
- `@faravahar/girih-spec` — `defineSpec` / `defineVariant` contracts, `ComponentIR`, contract validation against brand token graphs. May depend on `core` + `tokens`.
- `@faravahar/girih-generator-react` — IR + templates → React package source and structure-only CSS. May depend on `core` + `spec`.
- `@faravahar/girih` — the `girih` / `ds` binary. The only package that may depend on all of the above.
- `@faravahar/girih-react-runtime` — `BrandProvider`, `useBrand`, `cx`. Standalone; `react` is a **peer** dependency, never a real one.
- `create-girih` — `npx` bootstrapper. Zero workspace dependencies by design (it must run before anything is installed).
- `@faravahar/girih-figma` — phase-2 stub. Consumes `ComponentIR`; do not grow it without being asked.

**Non-negotiable invariants.** Breaking one of these is a design bug, not a style preference:

1. **Generated output is never hand-edited.** Anything under `examples/*/packages/`, `styles/`, `dist/`, or `.ds/ir/` is emitted. If it looks wrong, fix the generator or the contract — never the artifact. `.ds/manifest.json` drift detection will catch you, and `girih generate` will refuse to overwrite.
2. **Brands are skins, never forks.** A brand overlay may only override token paths that already exist. New paths are a hard error. Every brand must be structurally identical so one component set and one stylesheet serve all of them.
3. **Tier references flow downward only:** component → semantic → global. Never sideways, never upward.
4. **Every design value in emitted CSS is a `var()`.** Component CSS carries structure only. Aliases stay live `var()` references — never flattened to literals — so nested `[data-brand]` scopes rebrand at runtime with no rebuild.
5. **Contracts are data, not code.** `defineSpec` is authored in TypeScript for editor ergonomics and validated as pure data. A spec must never execute logic, import runtime code, or branch on environment.
6. **`generate`, `build`, and `publish` must never disagree** about what the package contains. They all route through `composeReact()` in [workspace.ts](packages/girih/src/workspace.ts) — extend that one function, not the three call sites.
7. **Semver comes from the contract diff, not judgement.** Token value change = patch, new variant = minor, anything removed = major. See [semver.ts](packages/girih/src/semver.ts).

**Diagnostics.** Every user-facing problem is a `Diagnostic` with a stable `GIRIH<n>` code, a `severity`, and — for anything actionable — a one-line `help`. Codes are partitioned by owner; stay in your range and never reuse a retired number:

| Range       | Owner             | Covers                                                   |
| ----------- | ----------------- | -------------------------------------------------------- |
| `GIRIH1xxx` | `core`, `cli`     | config, workspace, manifest/drift, `ds.lock`             |
| `GIRIH2xxx` | `tokens`          | parse, overlay, alias resolution, tier validation        |
| `GIRIH3xxx` | `generator-css`   | CSS emission, var-name collisions, unserializable values |
| `GIRIH4xxx` | `spec`            | contract shape, token refs, states, extensions           |
| `GIRIH5xxx` | `generator-react` | React emission                                           |
| `GIRIH6xxx` | `cli`             | build/publish                                            |

Never `throw` where a diagnostic will do. Errors that reach the user as a stack trace are bugs.

**CLI surface** — one module per command in [commands/](packages/girih/src/commands/), wired in [cli.ts](packages/girih/src/cli.ts); shared loading and composition in [workspace.ts](packages/girih/src/workspace.ts): `create <directory>` (`--name`, `--brand`, `--no-install`), `init`, `brand create <name>`, `check`, `doctor` (`--offline`), `generate [css|react]` (`--check`, `--force`), `eject <component>`, `forks`, `build`, `publish` (`--yes`, `--tag`, `--access`), `update` (`--check`). Plus `-v/--version`.

Two distinctions worth keeping straight, because conflating them is easy:

- **`check` vs `doctor`** — `check` validates the workspace's _content_ (tokens, contracts, drift). `doctor` validates the _environment_ (node, package manager, resolution, build prerequisites, version skew). `doctor` lives in [doctor.ts](packages/girih/src/doctor.ts) and must never duplicate a `check` validation.
- **`update` vs `forks`** — `update` upgrades the `@faravahar/girih-*` packages installed in the workspace. `forks` reports ejected components that drifted from their template (this was called `update` before publishing; the 3-way merge is still unbuilt).

`girih publish` publishes **the consumer's** generated design system, never girih itself. girih's own release is automated: every push to `main` runs `ci → docs → release`, and the last stage derives the version from the conventional commits since the last `v*` tag, publishes, then pushes the bump commit and tag. A commit releases only if both its type _and_ its scope can reach a consumer — `fix(ci):` cannot. `pnpm release:plan` shows what the next version would be. Never hand-edit a `version` field; the tooling owns them.

Resolution helpers live in [resolve.ts](packages/girih/src/resolve.ts) — `resolvePackageDir`, `resolvesFrom`, `installedVersion`. Use them rather than adding a fourth `node_modules` walk. Registry access goes through [registry.ts](packages/girih/src/registry.ts), which caches for 24h and honours `GIRIH_NO_UPDATE_CHECK`.

**Test layout.** `vitest.config.ts` aliases `@faravahar/girih-{core,tokens,generator-css,generator-react,spec}` to `src/index.ts`, so unit tests run against source with no build. `@faravahar/girih` and `@faravahar/girih-react-runtime` are **not** aliased — anything exercising them needs `pnpm build` first. Includes are `packages/*/test/**/*.test.ts` and `e2e/test/**/*.test.ts`.

# Decision Priority

When multiple valid patterns exist, prefer in order:

1. Existing implementation in the same file
2. Existing implementation in the same package
3. Existing implementation in `@faravahar/girih-core` (the shared kernel is where cross-package agreement lives)
4. New implementation in the package that owns the concern per the dependency direction above

Do not introduce a new pattern when a local pattern already exists. In particular: emit through `emittedFile`/`writeEmittedFiles`, report through `Diagnostic`, name CSS variables through `cssVarName`. Three code paths that hash, report, or name things differently is exactly the class of bug this architecture exists to prevent.

# Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

girih-specific: before adding a token, a variant, or a contract field, ask whether it belongs to the **token tier**, the **contract**, or the **template**. Putting a design value in a template or a structural value in a token is the most expensive mistake available here — it silently breaks rebranding for every consumer.

# Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

girih-specific: generated code is meant to be **read and reviewed** by the consumer. Emitted React and CSS should look like what a careful human would have written by hand — no clever indirection, no runtime config objects, no defensive branches for states the contract already forbids.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

# Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- When your changes create orphans: remove imports/variables/functions that YOUR changes made unused. Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

Comments in this codebase carry **rationale**, not description — they explain why a gate exists or why an ordering matters. Preserve them. If you change the mechanism a comment explains, update the comment in the same edit.

# Goal-Driven Execution

- Before finishing, run the smallest verification that proves the change: `pnpm typecheck` and `pnpm test`. Both must pass.
- If you touched a generator, also check the example: `pnpm example:check && pnpm example:drift`.
- For multi-step work, write a short TODO list and tick items as you go.
- A change is not done until typecheck and tests pass. `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on — they will reject code that looks fine.

# Verification Strategy

Prefer the smallest verification scope possible:

| Change                                        | Verification                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| One package's internals                       | `pnpm vitest run packages/<pkg>` then `pnpm typecheck`                                                         |
| Token engine or CSS generator                 | above + `pnpm example:check`                                                                                   |
| Contract, spec validation, or React templates | above + `pnpm example:drift`                                                                                   |
| CLI behavior                                  | `pnpm build` first (cli is not source-aliased in vitest), then exercise the command in `examples/acme-ds`      |
| Packaging, `dist/` shape, or publish flow     | `pnpm test` including `e2e/test/consumer.test.ts` — it packs tarballs and SSRs every component, and it is slow |

Avoid `pnpm build` at the root unless you changed something that downstream packages consume at build time. Never run `girih publish --yes`.

**Known flake — do not chase it.** `e2e/test/consumer.test.ts` intermittently fails with `ENOENT … e2e/.tmp/consumer/app/smoke.mjs`. Cause: [workspace.test.ts:28](e2e/test/workspace.test.ts#L28) removes all of `e2e/.tmp` in its `afterAll`, while [consumer.test.ts:12](e2e/test/consumer.test.ts#L12) keeps its scratch under `e2e/.tmp/consumer` — and vitest runs the two files in parallel, so the teardown can delete a live sibling's directory. Re-running usually passes, and the file passes in isolation (`pnpm vitest run e2e/test/consumer.test.ts`). If you see that ENOENT, it is this, not your change. The fix, when someone wants it, is to scope `workspace.test.ts`'s teardown to `e2e/.tmp/e2e-ds` and `e2e/.tmp/bad-brand`.

# Agent Instructions

- **Explore first.** Read the package's `src/index.ts` (its public surface) and its `test/` directory before editing. The tests document the intended contract more precisely than the types do.
- **Reuse over invent.** Before adding a helper, check `@faravahar/girih-core` — config, diagnostics, file emission, and CSS naming already live there and exist specifically to prevent divergence.
- **Respect the dependency direction.** If a fix seems to need an upward import, the logic belongs in a lower package or in `core`. An upward import is never the answer.
- **Diagnostics over exceptions.** New failure mode → new `GIRIH` code in your package's range, with `help`. Add a test asserting the code, not just the message text.
- **Never hand-edit emitted files.** `examples/*/packages/`, `styles/`, `dist/`, `.ds/ir/` are outputs. `examples/acme-ds/.ds/manifest.json` and `.ds/ir/` **are** committed; `examples/*/packages/`, `.ds/cache/`, `.ds/publish/`, and demo bundles are gitignored.
- **Token authoring:** three tiers under `examples/acme-ds/tokens/` — `global.tokens.json`, `semantic.tokens.json`, `components/<name>.tokens.json`. Brand overlays under `brands/<brand>/tokens.json` contain overrides only.
- **Contracts:** `examples/acme-ds/components/<name>.spec.ts` (default-exported `defineSpec`), extensions in `extensions/<name>.ext.ts` (default-exported `defineVariant`). Filenames are kebab-case; the `name` field is PascalCase and drives the emitted component name.
- **Commits:** this repo uses milestone-style subjects (`M6: packaging and publish — compiled dist, contract-diff semver`). Match that style; there is no commitlint to save you. Commit or push only when asked.
- **Never** commit `graphify-out/`, change the package manager, edit `tsconfig.base.json` compiler options, run `girih publish --yes`, or create new README/markdown files unless explicitly asked.

# Subagents

Four project-specific agents live in `.claude/agents/`. Prefer them over ad-hoc exploration for their domains:

- **token-auditor** — trace token graphs, alias chains, cycles, tier violations, per-brand override diffs
- **contract-reviewer** — review `defineSpec`/`defineVariant` against every brand's resolved token graph
- **generated-output-verifier** — confirm no drift and no stale emitted files before a commit
- **release-diff** — explain what a contract change does to the semver bump, before publishing
