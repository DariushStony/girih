import { defineConfig } from '@faravahar/girih';

export default defineConfig({
  name: '@acme/design-system',
  brands: {
    default: 'marketplace',
    definitions: {
      marketplace: { tokens: 'design/brands/marketplace.json', label: 'Marketplace' },
      seller: { tokens: 'design/brands/seller.json', label: 'Seller Platform' },
    },
  },
});
