<div align="center">

<img src="docs/brand/logomark.png" alt="" width="86">

# girih

**Compile multi-brand design systems from tokens and component contracts.**

girih (گره, Persian for _knot_) is design system **infrastructure**, not a component library.
You describe your design language once as data; girih compiles it into a versioned npm package.

[Quickstart](#quickstart) · [Documentation](docs/md/index.md) · [How it works](docs/md/03-how-it-works.md) · [Error codes](docs/md/07-error-codes.md)

</div>

---

## Quickstart

```bash
npx create-girih my-ds     # or: pnpm create girih my-ds
cd my-ds
```

That scaffolds a complete workspace and installs it with whichever package manager you
used — so the scripts work immediately.

```bash
npm run generate           # compile the design system package
open demo/index.html       # every variant, size and brand
```

Flip the brand toggle in the demo. The **corner radius** changes along with the colour,
because `radius.md` is a _global_ token two alias hops from a button's corner — and it
re-resolves in the browser with no rebuild. That cascade is the whole thesis.

> Requires **Node 22.22.1+**. Run `npx girih doctor` if anything looks off — it checks your
> node, package manager, resolution and build prerequisites in one pass.

### What you just made

```
my-ds/
├── design/                        ← everything you author
│   ├── tokens/
│   │   ├── global.tokens.json       raw values:  blue.600 = #2563EB
│   │   └── semantic.tokens.json     meaning:     color.action = {blue.600}
│   ├── brands/
│   │   └── main.json                overrides only
│   └── components/
│       └── button/
│           ├── button.contract.ts   what a Button is
│           └── button.tokens.json   what it uses:  button.bg = {color.action}
├── ds.config.ts
└── packages/design-system/        ← what girih writes; never edit by hand
```

One folder in, one package out. Everything about a component — its contract, its tokens,
its variants — lives in one directory, so adding a component is adding a folder and
deleting one is deleting a folder.

### The four commands

| Command            | What it does                                                             |
| ------------------ | ------------------------------------------------------------------------ |
| `npm run check`    | Validates tokens and contracts, prints the resolved token table          |
| `npm run generate` | Writes the design system package from your `design/` folder              |
| `npm run build`    | Compiles that package to publishable JS + `.d.ts`                        |
| `npx girih bake`   | Versions it from a contract diff and stages it in `.ds/baked` to publish |

`npx girih --help` lists the rest — `doctor`, `brand create`, `eject`, `forks`, `update`.

### Using it from an app

```bash
npm install @acme/design-system
```

```tsx
import { BrandProvider, Button } from '@acme/design-system';
import '@acme/design-system/styles/tokens.css';
import '@acme/design-system/styles/components.css';

<BrandProvider brand="seller">
  <Button tone="primary">Save</Button>
</BrandProvider>;
```

---

## Why it works this way

Every design system starts consistent and ends inconsistent. Add a second brand and it gets
worse, because now there is a legitimate-sounding reason to copy a component: the marketplace
needs a blue button, the seller console needs a green one, and the fastest path is
`SellerButton.tsx`. The moment that file exists you own two buttons forever, and the second
one is the one that stops getting fixed.

girih's answer is that **a new brand is never a new component** — it is a set of values
applied to the components that already exist. The name is the claim: medieval girih craftsmen
produced endless tiling patterns from a kit of five tiles whose edge treatments matched, so
any tile could sit beside any other. The variety came from assembly, not from cutting new
tiles.

Four rules make that hold:

|                                             |                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **One component set serves every brand**    | A brand overlay may only override token paths that already exist. Adding one is a hard error, so a brand can never quietly become a fork.                                       |
| **Rebranding needs no rebuild**             | Aliases are emitted as live `var()` references, and each brand scope re-declares the full dependents closure. Switching brand is one attribute change, resolved by the browser. |
| **Generated files are never silently lost** | `.ds/manifest.json` stores a SHA-256 per emitted file. `girih generate` refuses to overwrite anything a human edited, and names the files.                                      |
| **The version number means something**      | The semver bump comes from a diff of the contract — token value = patch, new variant = minor, anything removed = major — not from a human's judgement.                          |

---

## Documentation

Ten chapters, written to be read in order but usable as reference. Every value quoted is
extracted from the real example workspace by running girih's own engine over it — nothing is
invented for illustration.

| #   | Chapter                                        | What it covers                                                                                           |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 00  | [**Start here**](docs/md/index.md)             | What girih is, the shape of a workspace, the four promises.                                              |
| 01  | [**The idea**](docs/md/01-the-idea.md)         | Why design systems drift, the girih tiles, and the bet this project makes.                               |
| 02  | [**Installation**](docs/md/02-installation.md) | Empty folder to a rebrandable button, plus every command and every failure mode.                         |
| 03  | [**How it works**](docs/md/03-how-it-works.md) | The six-stage compile pipeline with real data moving through it.                                         |
| 04  | [**Tokens and brands**](docs/md/04-tokens.md)  | Three tiers, alias chains, the override-only rule, the dependents closure. **The chapter that matters.** |
| 05  | [**Contracts**](docs/md/05-contracts.md)       | `defineSpec` → IR → typed React. Extensions, ejection, contract-derived semver.                          |
| 06  | [**The code**](docs/md/06-the-code.md)         | All nine packages (eight published), the dependency direction, and where to look when something breaks.  |
| 07  | [**Error codes**](docs/md/07-error-codes.md)   | All 74 `GIRIH` diagnostics, extracted from source, with what each is telling you.                        |
| 08  | [**Check yourself**](docs/md/08-quiz.md)       | Ten questions that are hard to answer without the model.                                                 |

New to design tokens? Chapter 01 opens with a collapsible primer that assumes nothing.

### Interactive version

The same chapters exist as self-contained HTML with four live widgets — a **brand switch**
running on the real generated CSS, an **alias-chain walker**, a **pipeline stepper**, and a
**scored quiz**. No server, no build, no network requests.

```bash
open docs/index.html
```

To publish them, set **Settings → Pages → Build and deployment → Source** to **GitHub
Actions**. The site then serves at `https://<owner>.github.io/<repo>/`, deployed by
[`.github/workflows/docs.yml`](.github/workflows/docs.yml) on every push to `main`.

---

## For contributors

Everything above is for someone deciding whether to use girih. Below is for someone changing
it.

```bash
git clone https://github.com/DariushStony/girih.git && cd girih
pnpm install && pnpm build
pnpm verify                   # the whole gate: types, lint, format, tests, example, docs
```

The fully worked example — six contracts, two brands, an extension — lives in
[`examples/acme-ds`](examples/acme-ds):

```bash
cd examples/acme-ds
pnpm run check                # resolved token table + contract validation
pnpm run demo:react           # generate the React package, bundle the demo
open demo/react/index.html    # variant matrix with a live brand toggle
```

### Layout

Nine packages. The dependency direction _is_ the architecture — nothing enforces it
mechanically, so it is a review responsibility.

```
core  ←  tokens  ←  generator-css
core, tokens  ←  spec  ←  generator-react
                                     ↖ core
core, tokens, spec, generator-css, generator-react  ←  cli

standalone:  react-runtime (react is a peer dep) · create-girih (zero runtime deps) · figma (stub)
```

| Package                                                          | Role                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`@faravahar/girih-core`](packages/girih-core)                   | Config loading, diagnostics, the emitted-file model, CSS variable naming. Depends on nothing. |
| [`@faravahar/girih-tokens`](packages/girih-tokens)               | DTCG parse → brand merge → alias resolve → tier validation.                                   |
| [`@faravahar/girih-generator-css`](packages/girih-generator-css) | Token graphs → multi-brand CSS custom properties + `TokenPath` types.                         |
| [`@faravahar/girih-spec`](packages/girih-spec)                   | `defineSpec` / `defineVariant` contracts, `ComponentIR`, cross-brand validation.              |

The full table, the diagnostic ranges, and the house rules are in
[CONTRIBUTING.md](CONTRIBUTING.md). Read that before your first change — in particular the
macOS filesystem trap and the unbuilt-tree checks, both of which have turned the pipeline red.

## Status

Milestones M1–M6 are functional and published. `@faravahar/girih-figma` is a deliberate
phase-2 stub. The `forks` command reports template drift but the three-way merge is not built
yet.

## License

MIT © Dariush Hadipour
