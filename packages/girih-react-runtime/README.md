# @faravahar/girih-react-runtime

The small runtime girih's generated components import: `BrandProvider`, `useBrand`
and `cx`.

```bash
npm install @faravahar/girih-react-runtime
```

You rarely install this directly — a girih-generated design system declares it as a
dependency.

> **Part of [girih](https://github.com/DariushStony/girih).** girih is design-system _infrastructure_: it compiles a
> declared design language — DTCG tokens, brand overlays, component contracts — into a
> governed, versioned npm package. This is one package of nine; most people want
> [`@faravahar/girih`](https://www.npmjs.com/package/@faravahar/girih) (the CLI) or
> [`create-girih`](https://www.npmjs.com/package/create-girih) instead.

## Usage

```tsx
import { BrandProvider } from '@faravahar/girih-react-runtime';

<BrandProvider brand="seller">
  <Button variant="primary">Save</Button>
</BrandProvider>;
```

`BrandProvider` sets `data-brand`, which is the whole rebranding mechanism: the CSS
custom properties for that brand take over, resolved by the browser with no rebuild.
Nesting works, so one region can render in a different brand than its parent.

`BrandProvider` always renders a wrapping `<div>` (with `display: contents` so it
doesn't affect layout). `display: contents` doesn't change HTML content-model rules,
so wrapping it around a single `<tr>`, `<li>`, or `<button>` is invalid — the browser
will relocate or rewrite that markup. Wrap a container element instead, or scope the
brand higher up the tree.

`react` is a peer dependency (>= 18), never a real one.

## Documentation

Nine chapters covering tokens, contracts, generation and every diagnostic:
**[https://github.com/DariushStony/girih#readme](https://github.com/DariushStony/girih#readme)**

## License

MIT
