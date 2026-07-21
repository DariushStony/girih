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

Early. Milestones M1 (token engine) and M2 (multi-brand CSS generation) are functional:

- DTCG 2025.10-style token files, three tiers: global → semantic → component
- Brand overlays with the override-only rule (brands are skins, never forks)
- Alias resolution with full-chain cycle diagnostics, tier-direction validation
- `girih check` — resolved token table + rich diagnostics
- `girih generate css` — one stylesheet: `:root` for the default brand plus
  `[data-brand="x"]` blocks containing only each brand's overrides (cascade does the rest)
- `girih generate css --check` — CI staleness gate

## Try it

```bash
pnpm install && pnpm build
cd examples/acme-ds
pnpm check              # resolved token table + diagnostics
pnpm generate           # emits packages/design-system/styles/{tokens.css,tokens.d.ts}
open demo/index.html    # flip the brand toggle
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
