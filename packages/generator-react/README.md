# @faravahar/girih-generator-react

Turns a girih `ComponentIR` plus hand-maintained templates into React package source
and structure-only CSS.

> **Part of [girih](https://github.com/DariushStony/girih).** girih is design-system *infrastructure*: it compiles a
> declared design language — DTCG tokens, brand overlays, component contracts — into a
> governed, versioned npm package. This is one package of eight; most people want
> [`@faravahar/girih`](https://www.npmjs.com/package/@faravahar/girih) (the CLI) or
> [`create-girih`](https://www.npmjs.com/package/create-girih) instead.

Emitted components are meant to be **read and reviewed** by the consumer, so the output
looks like what a careful human would have written: typed variant unions, data
attributes for styling hooks, `forwardRef`, and no runtime config objects or defensive
branches for states the contract already forbids.

Component CSS carries structure only — every design value lives in a token and arrives
as a `var()`.

## Documentation

Nine chapters covering tokens, contracts, generation and every diagnostic:
**[https://github.com/DariushStony/girih#readme](https://github.com/DariushStony/girih#readme)**

## License

MIT
