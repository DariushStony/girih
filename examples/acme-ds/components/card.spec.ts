import { defineSpec } from '@faravahar/girih';

export default defineSpec({
  name: 'Card',
  description: 'Grouped surface for related content.',
  element: 'div',

  slots: { children: { required: true } },

  tokens: {
    base: {
      background: '{card.background}',
      border: '{card.border}',
      borderRadius: '{card.radius}',
      padding: '{card.padding}',
    },
  },

  accessibility: { focusable: false },
});
