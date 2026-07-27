import { defineConfig } from '@faravahar/girih';

export default defineConfig({
  name: '@acme/design-system',
  brands: {
    default: 'marketplace',
    definitions: {
      marketplace: { tokens: 'brands/marketplace/tokens.json', label: 'Marketplace' },
      seller: { tokens: 'brands/seller/tokens.json', label: 'Seller Platform' },
    },
  },
});
