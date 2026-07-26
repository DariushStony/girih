# girih

> One warp, many wefts: compile multi-brand design systems from tokens and component contracts.

**girih** (گره) is design system *infrastructure*, not a component library. You declare your
design language — DTCG tokens, brand overlays, component contracts — in a local-first git
workspace, and girih compiles it into governed, versioned, production-ready artifacts
(CSS today; a React package next). Like the girih tiles of Persian architecture, a small set
of shared pieces generates endless brand expressions.

```
tokens/ + brands/ + components/   ──girih generate──▶   @acme/design-system
        (source of truth)                                (build artifact, never hand-edited)
```

## Status

Milestones M1–M4 are functional:

- **Tokens (M1/M2)** — DTCG 2025.10-style files in three tiers (global → semantic →
  component); brand overlays with the override-only rule (brands are skins, never
  forks); alias resolution with full-chain cycle diagnostics; tier-direction
  validation; multi-brand CSS with `var()` references preserved so nested
  `[data-brand]` scopes rebrand correctly.
- **Contracts (M3)** — `defineSpec()` component contracts in TypeScript, enforced
  as pure data, cross-validated against every brand's resolved token graph
  (unknown refs, reserved prop names, unimplementable states are build errors).
- **React (M3)** — `girih generate react` compiles contracts into a readable,
  typed React package: variant unions, data-attribute styling hooks, a11y wiring
  (`aria-busy`, `aria-disabled`, focus ring), structure-only component CSS where
  every design value is a token `var()`. Runtime: `BrandProvider` / `useBrand`.
- **Workspace (M4)** — `create-girih` / `girih init` scaffold a working starter
  (tokens, a Button contract, a no-bundler demo page); `girih brand create` adds
  overlays; `.ds/manifest.json` drift detection refuses to clobber hand-edited
  output; canonical ComponentIR lands in `.ds/ir/` for future targets (Figma).
- **Catalog & extensibility (M5)** — 6 components incl. a Checkbox (styled native
  input) and a **Dialog on Base UI** behind a swappable adapter; `defineVariant`
  extensions constrained by `overridableTokens`; `girih eject` — a tracked fork
  recorded in a committed `ds.lock`, stitched back in while its CSS stays generated.
- **Packaging (M6)** — `girih build` compiles the package to publishable `dist/`
  (per-file ESM + `.d.ts`, works under every consumer `moduleResolution`);
  `girih publish` derives the semver bump from the **contract diff** (token value
  = patch, new variant = minor, removed anything = major) and publishes (dry-run
  by default). Proven end-to-end: an npm-packed tarball installs into a fresh
  consumer and server-renders every component.

## Try it

```bash
pnpm install && pnpm build

# start from nothing:
node packages/create-girih/dist/cli.js my-ds --workspace   # (npx create-girih after M6 publish)
cd my-ds && pnpm exec girih generate react && open demo/index.html

# or explore the richer example:
cd examples/acme-ds
pnpm check                    # token table + contract validation
pnpm run demo:react           # generate + bundle the React demo
open demo/react/index.html    # variant matrix with a live brand toggle
```

## Monorepo

| Package | Role |
| --- | --- |
| `@girih/core` | config loading, diagnostics, emitted-file model |
| `@girih/tokens` | DTCG parse → brand merge → alias resolve → tier validation |
| `@girih/generator-css` | token graphs → multi-brand CSS custom properties + `TokenPath` types |
| `@girih/cli` | `girih` / `ds` — check, generate, (init/eject/publish soon) |
| `@girih/spec` | component contracts (M3) |
| `@girih/generator-react` | spec + templates → React package (M3) |
| `@girih/react-runtime` | BrandProvider, createVariant (M3) |
| `create-girih` | npx bootstrapper (M4) |
| `@girih/figma` | phase 2 |
