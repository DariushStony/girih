# create-girih

Scaffold a girih design-system workspace.

```bash
npx create-girih my-ds
pnpm create girih my-ds
npm create girih my-ds
yarn create girih my-ds
```

It creates the directory, writes `package.json`, installs the toolchain, then delegates
to `girih init` — so the workspace template lives in the CLI and the two can never
drift apart.

## Options

| Flag               |                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `--name <package>` | Published package name (default: `@<directory>/design-system`)                           |
| `--brand <name>`   | Default brand, lowercase kebab-case (default: `main`)                                    |
| `--workspace`      | Link the girih packages by workspace protocol, for development inside the girih monorepo |
| `--no-install`     | Scaffold only, then print the commands to finish by hand                                 |

## What you get

Tokens in three tiers, one `Button` contract, a brand overlay, and a demo page that
renders with no bundler. Then:

```bash
cd my-ds
girih check            # resolved token table + contract validation
girih generate react   # compile the design system package
open demo/index.html   # every variant, size and brand
```

## Requires

Node >= 22.

## Documentation

Nine chapters covering tokens, contracts, generation and every diagnostic:
**[https://github.com/DariushStony/girih#readme](https://github.com/DariushStony/girih#readme)**

## License

MIT
