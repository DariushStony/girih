# @faravahar/girih-core

girih's shared kernel: workspace config loading, the `Diagnostic` model, the
`EmittedFile` model (`emittedFile`, `writeEmittedFiles`, `verifyEmittedFiles`), and
`cssVarName`.

> **Part of [girih](https://github.com/DariushStony/girih).** girih is design-system _infrastructure_: it compiles a
> declared design language — DTCG tokens, brand overlays, component contracts — into a
> governed, versioned npm package. This is one package of eight; most people want
> [`@faravahar/girih`](https://www.npmjs.com/package/@faravahar/girih) (the CLI) or
> [`create-girih`](https://www.npmjs.com/package/create-girih) instead.

Depends on nothing else in the workspace — it exists so that config loading, problem
reporting, file emission and CSS naming have exactly one implementation each. Three code
paths that hash, report or name things differently is the class of bug girih's
architecture exists to prevent.

## Documentation

Nine chapters covering tokens, contracts, generation and every diagnostic:
**[https://github.com/DariushStony/girih#readme](https://github.com/DariushStony/girih#readme)**

## License

MIT
