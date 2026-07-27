# @faravahar/girih-spec

girih's component contracts: `defineSpec`, `defineVariant`, the canonical
`ComponentIR`, and validation against each brand's resolved token graph.

> **Part of [girih](https://github.com/DariushStony/girih).** girih is design-system *infrastructure*: it compiles a
> declared design language — DTCG tokens, brand overlays, component contracts — into a
> governed, versioned npm package. This is one package of eight; most people want
> [`@faravahar/girih`](https://www.npmjs.com/package/@faravahar/girih) (the CLI) or
> [`create-girih`](https://www.npmjs.com/package/create-girih) instead.

## Contracts are data, not code

A spec is authored in TypeScript for editor ergonomics and validated as pure data. It
must never execute logic, import runtime code, or branch on environment — which is what
makes the same contract usable by the React generator, a future Figma target, and the
contract-diff that decides the semver bump.

```ts
export default defineSpec({
  name: 'Button',
  element: 'button',
  variants: { variant: { values: ['primary', 'secondary'], default: 'primary' } },
  states: ['hover', 'disabled'],
  tokens: { base: { borderRadius: '{button.radius}' } },
  accessibility: { focusable: true },
});
```

Validation is per brand: a token reference that resolves under one brand and not another
is an error (`GIRIH4xxx`), because the emitted component has to work for all of them.

## Documentation

Nine chapters covering tokens, contracts, generation and every diagnostic:
**[https://github.com/DariushStony/girih#readme](https://github.com/DariushStony/girih#readme)**

## License

MIT
