# @faravahar/girih-tokens

girih's token engine: DTCG parsing, brand overlay merging, alias resolution and
three-tier validation.

> **Part of [girih](https://github.com/DariushStony/girih).** girih is design-system _infrastructure_: it compiles a
> declared design language — DTCG tokens, brand overlays, component contracts — into a
> governed, versioned npm package. This is one package of eight; most people want
> [`@faravahar/girih`](https://www.npmjs.com/package/@faravahar/girih) (the CLI) or
> [`create-girih`](https://www.npmjs.com/package/create-girih) instead.

## The model

Three tiers, and references flow **downward only** — component → semantic → global,
never sideways and never up:

```
global.color.blue.500      the raw value
  ↑
semantic.action.background aliases global
  ↑
button.primary.background  aliases semantic
```

A brand overlay may only override paths that already exist. Adding one is a hard error
(`GIRIH2xxx`), which is what keeps every brand structurally identical so one component
set and one stylesheet can serve all of them.

## Documentation

Nine chapters covering tokens, contracts, generation and every diagnostic:
**[https://github.com/DariushStony/girih#readme](https://github.com/DariushStony/girih#readme)**

## License

MIT
