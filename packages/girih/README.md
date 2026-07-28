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

| Command                       | What it does                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `girih check`                 | Validate tokens, brands, contracts and extensions; print the resolved token table                |
| `girih doctor`                | Diagnose the _environment_: node, package manager, resolution, build prerequisites, version skew |
| `girih generate [css\|react]` | Compile the design system. `--check` verifies, `--force` overrides the drift gate                |
| `girih brand create <name>`   | Add a brand overlay and register it                                                              |
| `girih eject <component>`     | Convert one generated component into a tracked fork                                              |
| `girih forks`                 | Report ejected forks that drifted from the current templates                                     |
| `girih build`                 | Compile the generated package to publishable `dist/`                                             |
| `girih bake`                  | Version **your** design system from its contract diff and stage it in `.ds/baked` to publish     |
| `girih update`                | Upgrade the `@faravahar/girih-*` packages in this workspace                                      |

`girih check` validates what your workspace _contains_; `girih doctor` validates the
environment it runs _in_. Between them they answer "it worked on my machine".

`girih bake` versions the design system _you_ generated — not girih itself — and stages it
into `.ds/baked`. It never calls npm or any registry; publishing that folder with whatever
tool and registry you use is entirely up to you. Use `girih bake --check` to preview the
version bump with no side effects.

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
