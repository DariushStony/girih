import { defineSpec } from '@faravahar/girih';

export default defineSpec({
  name: 'Badge',
  description: 'Small status label.',
  element: 'span',

  variants: {
    tone: { values: ['neutral', 'primary', 'danger'], default: 'neutral' },
  },

  slots: { children: { required: true } },

  tokens: {
    base: {
      borderRadius: '{badge.radius}',
      paddingInline: '{badge.padding-inline}',
      fontSize: '{typography.size-sm}',
      fontWeight: '{typography.weight-medium}',
      fontFamily: '{typography.body-family}',
    },
    variants: {
      tone: {
        neutral: { background: '{badge.neutral.background}', color: '{badge.neutral.foreground}' },
        primary: { background: '{badge.primary.background}', color: '{badge.primary.foreground}' },
        danger: { background: '{badge.danger.background}', color: '{badge.danger.foreground}' },
      },
    },
  },

  accessibility: { focusable: false },
});
