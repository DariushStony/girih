import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BrandProvider, useBrand } from '../src/index.js';

function ShowBrand() {
  const brand = useBrand();
  return <span>{brand ?? 'none'}</span>;
}

describe('useBrand', () => {
  it('is undefined outside any BrandProvider', () => {
    expect(renderToStaticMarkup(<ShowBrand />)).toContain('>none<');
  });

  it('resolves to the nearest BrandProvider, nesting per level', () => {
    const html = renderToStaticMarkup(
      <BrandProvider brand="marketplace">
        <ShowBrand />
        <BrandProvider brand="seller">
          <ShowBrand />
        </BrandProvider>
        <ShowBrand />
      </BrandProvider>,
    );
    const brands = [...html.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(brands).toEqual(['marketplace', 'seller', 'marketplace']);
  });
});
