<div align="center">

# girih

**One warp, many wefts — compile multi-brand design systems from tokens and component contracts.**

girih (گره, Persian for *knot*) is design system **infrastructure**, not a component library.
You declare your design language once; girih compiles it into a governed, versioned npm package.

[Documentation](docs/md/index.md) · [The idea](docs/md/01-the-idea.md) · [Install](docs/md/02-installation.md) · [How it works](docs/md/03-how-it-works.md) · [Error codes](docs/md/07-error-codes.md)

</div>

---

## The problem

Every design system starts consistent and ends inconsistent. Add a second brand and it gets worse,
because now there is a legitimate-sounding reason to copy a component: the marketplace needs a blue
button, the seller console needs a green one, and the fastest path is `SellerButton.tsx`. The moment
that file exists you own two buttons forever, and the second one is the one that stops getting fixed.

## The approach

Describe the design language as data. Compile it.

```
tokens/ + brands/ + components/   ──girih generate──▶   @acme/design-system
        (source of truth)                               (build artifact, never hand-edited)
```

A new brand is never a new component — it is a set of values applied to the components that already
exist. The name is the claim: medieval girih craftsmen produced endless tiling patterns from a kit of
five tiles whose edge treatments matched, so any tile could sit beside any other. The variety came
from assembly, not from cutting new tiles.

## What that buys you

| | |
| --- | --- |
| **One component set serves every brand** | A brand overlay may only override token paths that already exist. Adding one is a hard error, so a brand can never quietly become a fork. |
| **Rebranding needs no rebuild** | Aliases are emitted as live `var()` references and each brand scope re-declares the full dependents closure. Switching brand is one attribute change, resolved by the browser. |
| **Generated files are never silently lost** | `.ds/manifest.json` stores a SHA-256 per emitted file. `girih generate` refuses to overwrite anything a human edited, and names the files. |
| **The version number means something** | The semver bump is computed from a diff of the contract — token value = patch, new variant = minor, anything removed = major — not chosen by a human. |

## See it in 60 seconds

```bash
git clone <this-repo> girih && cd girih
pnpm install && pnpm build

cd examples/acme-ds
pnpm check                    # resolved token table + contract validation
pnpm run demo:react           # generate the React package, bundle the demo
open demo/react/index.html    # variant matrix with a live brand toggle
```

Flip the brand toggle and watch the **corner radius** change along with the colour. The `seller`
brand overrides three tokens — one of them `radius.md`, a *global* token two alias hops away from a
button's corner. That cascade arriving correctly, with no rebuild, is the whole thesis.

> [!IMPORTANT]
> **Nothing is published to npm yet.** Every package is at `0.1.0` and unpublished, so
> `npm install @girih/cli` and `npx create-girih` do not work today. Both paths are wired and
> proven — the end-to-end suite packs real tarballs, installs them into a fresh consumer, and
> server-renders every component — but the publish has not happened. Build from source for now.

---

## Documentation

Nine chapters, written to be read in order but usable as reference. Every value quoted is extracted
from the real example workspace by running girih's own engine over it — nothing is invented for
illustration.

| # | Chapter | What it covers |
| --- | --- | --- |
| 00 | [**Start here**](docs/md/index.md) | What girih is, the shape of a workspace, the four promises. |
| 01 | [**The idea**](docs/md/01-the-idea.md) | Why design systems drift, the girih tiles, and the bet this project makes. |
| 02 | [**Installation**](docs/md/02-installation.md) | Empty folder to a rebrandable button, plus every command and every failure mode. |
| 03 | [**How it works**](docs/md/03-how-it-works.md) | The six-stage compile pipeline with real data moving through it. |
| 04 | [**Tokens and brands**](docs/md/04-tokens.md) | Three tiers, alias chains, the override-only rule, the dependents closure. **The chapter that matters.** |
| 05 | [**Contracts**](docs/md/05-contracts.md) | `defineSpec` → IR → typed React. Extensions, ejection, contract-derived semver. |
| 06 | [**The code**](docs/md/06-the-code.md) | All nine packages, the dependency direction, and where to look when something breaks. |
| 07 | [**Error codes**](docs/md/07-error-codes.md) | All 70 `GIRIH` diagnostics, extracted from source, with what each is telling you. |
| 08 | [**Check yourself**](docs/md/08-quiz.md) | Ten questions that are hard to answer without the model. |

### Interactive version

The same nine chapters exist as self-contained HTML with four live widgets — a **brand switch**
running on the real generated CSS, an **alias-chain walker**, a **pipeline stepper**, and a
**scored quiz**. No server, no build, no network requests.

```bash
open docs/index.html
```

To publish them, enable **GitHub Pages** for this repository with source `main` / `/docs`
(Settings → Pages). The site then serves at `https://<owner>.github.io/<repo>/`, and a workflow at
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) will deploy on every push to `main`.

New to design tokens? Chapter 01 opens with a collapsible primer that assumes nothing.

---

## For contributors

Everything above is for someone deciding whether to use girih. Below is for someone changing it.

### Layout

Nine packages. The dependency direction *is* the architecture — nothing enforces it mechanically, so
it is a review responsibility.

```
core  ←  tokens  ←  generator-css
core, tokens  ←  spec  ←  generator-react
                                     ↖ core
core, tokens, spec, generator-css, generator-react  ←  cli

standalone:  react-runtime (react is a peer dep) · create-girih (zero workspace deps) · figma (stub)
```

| Package | Role |
| --- | --- |
| [`@girih/core`](packages/core) | Config loading, diagnostics, the emitted-file model, CSS variable naming. Depends on nothing. |
| [`@girih/tokens`](packages/tokens) | DTCG parse → brand merge → alias resolve → tier validation. |
| [`@girih/generator-css`](packages/generator-css) | Token graphs → multi-brand CSS custom properties + `TokenPath` types. |
| [`@girih/spec`](packages/spec) | `defineSpec` / `defineVariant` contracts, `ComponentIR`, cross-brand validation. |
| [`@girih/generator-react`](packages/generator-react) | IR + templates → React package and structure-only CSS. |
| [`@girih/cli`](packages/cli) | The `girih` / `ds` binary. The only package allowed to depend on all of the above. |
| [`@girih/react-runtime`](packages/react-runtime) | `BrandProvider`, `useBrand`, `cx`. The entire runtime. |
| [`create-girih`](packages/create-girih) | `npx` bootstrapper. Zero workspace deps by necessity. |
| [`@girih/figma`](packages/figma) | Phase-2 stub; consumes `ComponentIR`. |

### Verifying a change

Smallest scope that proves it, in order:

```bash
pnpm vitest run packages/<pkg>    # unit tests run against source — no build needed
pnpm typecheck                    # strict, with exactOptionalPropertyTypes + noUncheckedIndexedAccess
pnpm test                         # everything, including the slow consumer e2e
pnpm build                        # required before exercising the CLI (cli is not source-aliased)

cd examples/acme-ds
pnpm exec girih check
pnpm exec girih generate react --check   # staleness gate; writes nothing
```

There is **no linter and no formatter** in this repo. Verification is `pnpm typecheck` plus
`pnpm test`. Do not add lint tooling without asking.

> [!NOTE]
> **Known flake.** `e2e/test/consumer.test.ts` intermittently fails with
> `ENOENT … e2e/.tmp/consumer/app/smoke.mjs`. Cause: `workspace.test.ts` removes all of `e2e/.tmp`
> in its `afterAll` while `consumer.test.ts` keeps its scratch under `e2e/.tmp/consumer`, and vitest
> runs the files in parallel. Re-run, or run it alone. Not your change.

### House rules

The full set is in [CONTRIBUTING.md](CONTRIBUTING.md) and [CLAUDE.md](CLAUDE.md). The four that
matter most:

1. **Never hand-edit generated output.** `examples/*/packages/`, `styles/`, `dist/`, `.ds/ir/` are
   artifacts. Fix the generator or the contract.
2. **Respect the dependency direction.** If a fix seems to need an upward import, the logic belongs
   lower down or in `core`.
3. **Diagnostics, not exceptions.** New failure mode → a new `GIRIH` code in your package's range,
   with a `help` line and a test asserting the code.
4. **Route emission through `core`.** `emittedFile`, `writeEmittedFiles`, `cssVarName` — three code
   paths that hash or name things differently is exactly the bug class this design prevents.

### Building the docs

The documentation is generated, in the same spirit as girih's own output.

```bash
pnpm build                                    # the extractor imports built packages
node docs/scripts/extract-tokens.mjs          # real token graphs → docs/data/tokens.json
node docs/scripts/extract-diagnostics.mjs     # all GIRIH codes   → docs/data/diagnostics.json
node docs/scripts/build-docs.mjs              # → docs/*.html and docs/md/*.md
```

Edit `docs/scripts/pages/*.mjs`, never `docs/*.html`. See [docs/README.md](docs/README.md) for the
full layout.

---

## Status

Milestones M1–M6 are functional.

- **M1/M2 — Tokens.** DTCG files in three tiers; brand overlays with the override-only rule; alias
  resolution with full-chain cycle diagnostics; tier-direction validation; multi-brand CSS with
  `var()` preserved so nested `[data-brand]` scopes rebrand correctly.
- **M3 — Contracts and React.** `defineSpec()` enforced as pure data, cross-validated against every
  brand's resolved token graph. `girih generate react` emits a readable typed package with variant
  unions, data-attribute styling hooks and a11y wiring. Runtime: `BrandProvider` / `useBrand`.
- **M4 — Workspace.** `create-girih` / `girih init` scaffold a working starter; `girih brand create`
  adds overlays; `.ds/manifest.json` drift detection; canonical `ComponentIR` in `.ds/ir/`.
- **M5 — Catalog and extensibility.** Six components including a Checkbox and a Dialog on Base UI
  behind a swappable adapter; `defineVariant` extensions constrained by `overridableTokens`;
  `girih eject` as a tracked fork recorded in a committed `ds.lock`.
- **M6 — Packaging.** `girih build` compiles to publishable `dist/` (per-file ESM + `.d.ts`, correct
  under every consumer `moduleResolution`); `girih publish` derives the bump from the contract diff,
  dry-run by default.

**Not done:** the Figma target is a stub, and `girih update` reports drift in ejected forks but does
not perform the three-way merge. Nothing is published to npm.

## License

[MIT](LICENSE)
