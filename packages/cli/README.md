# @faravahar/girih

The girih CLI — compiles a multi-brand design system from tokens and component contracts.

```bash
npm install -g @faravahar/girih   # or: npm install -D @faravahar/girih
```

Provides two identical binaries: `girih` and `ds`.

## Starting a workspace

```bash
npx create-girih my-ds     # no CLI needed — scaffolds, installs, initialises
girih create my-ds         # same, if you already have the CLI
girih init                 # add girih to a project that already has a package.json
```

## Commands

| Command | What it does |
| --- | --- |
| `girih check` | Validate tokens, brands, contracts and extensions; print the resolved token table |
| `girih doctor` | Diagnose the *environment*: node, package manager, resolution, build prerequisites, version skew |
| `girih generate [css\|react]` | Compile the design system. `--check` verifies, `--force` overrides the drift gate |
| `girih brand create <name>` | Add a brand overlay and register it |
| `girih eject <component>` | Convert one generated component into a tracked fork |
| `girih forks` | Report ejected forks that drifted from the current templates |
| `girih build` | Compile the generated package to publishable `dist/` |
| `girih publish` | Version **your** design system from its contract diff and publish it |
| `girih update` | Upgrade the `@faravahar/girih-*` packages in this workspace |

`girih check` validates what your workspace *contains*; `girih doctor` validates the
environment it runs *in*. Between them they answer "it worked on my machine".

`girih publish` publishes the design system *you* generated — not girih itself. It is a
dry run unless you pass `--yes`.

## What it guarantees

- A brand overlay may only override token paths that already exist. New paths are a hard error, so a brand can never quietly become a fork.
- Every design value in emitted CSS is a `var()`, and aliases stay live references — so switching brand is one attribute change with no rebuild.
- `girih generate` refuses to overwrite a generated file you edited by hand, and names it.
- The semver bump is computed from a diff of the contract, not chosen by a human.

## Requires

Node >= 22.

## Documentation

Nine chapters covering tokens, contracts, generation and every diagnostic:
**[https://github.com/DariushStony/girih#readme](https://github.com/DariushStony/girih#readme)**

## License

MIT
