# @faravahar/girih-generator-css

Turns girih token graphs into multi-brand CSS custom properties plus a `TokenPath`
union type.

> **Part of [girih](https://github.com/DariushStony/girih).** girih is design-system *infrastructure*: it compiles a
> declared design language — DTCG tokens, brand overlays, component contracts — into a
> governed, versioned npm package. This is one package of eight; most people want
> [`@faravahar/girih`](https://www.npmjs.com/package/@faravahar/girih) (the CLI) or
> [`create-girih`](https://www.npmjs.com/package/create-girih) instead.

Every design value is emitted as a `var()`, and aliases stay **live references** rather
than being flattened to literals. Each brand scope re-declares the full dependents
closure, so a nested `[data-brand]` rebrands at runtime with no rebuild:

```css
:root            { --ds-button-radius: var(--ds-radius-md); }
[data-brand='seller'] { --ds-radius-md: 2px; }
```

Changing one global token cascades to every component that aliases it, resolved by the
browser.

## Documentation

Nine chapters covering tokens, contracts, generation and every diagnostic:
**[https://github.com/DariushStony/girih#readme](https://github.com/DariushStony/girih#readme)**

## License

MIT
