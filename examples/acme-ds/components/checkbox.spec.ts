import { defineSpec } from '@faravahar/girih';

export default defineSpec({
  name: 'Checkbox',
  description: 'A binary choice with native form semantics.',
  template: 'checkbox',

  variants: {
    size: { values: ['sm', 'md'], default: 'md' },
  },
  states: ['hover', 'focus-visible', 'disabled', 'checked'],

  tokens: {
    base: {
      background: '{checkbox.background}',
      borderColor: '{checkbox.border}',
      borderRadius: '{checkbox.radius}',
    },
    states: {
      hover: { borderColor: '{checkbox.border-hover}' },
      checked: {
        background: '{checkbox.background-checked}',
        borderColor: '{checkbox.background-checked}',
        color: '{checkbox.glyph}',
      },
    },
    variants: {
      size: {
        sm: { width: '{checkbox.size.sm}', height: '{checkbox.size.sm}' },
        md: { width: '{checkbox.size.md}', height: '{checkbox.size.md}' },
      },
    },
  },

  accessibility: { focusable: true },
});
