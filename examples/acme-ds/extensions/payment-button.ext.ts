import { defineVariant } from '@girih/cli';

export default defineVariant({
  name: 'PaymentButton',
  extends: 'Button',
  description: 'Checkout call-to-action — high-contrast, brand-independent emphasis.',
  tokens: {
    background: '{color.text}',
    color: '{color.background}',
  },
});
