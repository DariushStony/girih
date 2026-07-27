<!--
Conventional commit subject, e.g. `fix(girih-tokens): reject an upward tier reference`.
Scopes are the package directory names; a change spanning several omits the scope.
-->

## What and why

<!-- The reasoning, not the file list — the diff already lists the files. -->

## Verification

- [ ] `pnpm verify` passes (build, typecheck, lint, format, tests, example drift)
- [ ] New failure modes report a `GIRIH` diagnostic with a `help` line, not an exception
- [ ] No generated file was hand-edited (`examples/*/packages/`, `styles/`, `dist/`, `.ds/ir/`)
- [ ] Docs regenerated with `pnpm docs:generate` if any prose or extracted data changed

## Invariants

Confirm none of these is broken, or say which and why it is right:

- [ ] Brand overlays override existing token paths only — never introduce one
- [ ] Tier references flow downward only: component → semantic → global
- [ ] Every design value in emitted CSS is a `var()`; aliases stay live
- [ ] `generate`, `build` and `publish` still agree, via `composeReact()`
- [ ] The package dependency direction is unchanged (no upward import)
