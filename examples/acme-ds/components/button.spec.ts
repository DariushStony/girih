import { defineSpec } from '@girih/cli';

export default defineSpec({
  name: 'Button',
  description: 'Triggers an action. Single-line label.',
  element: 'button',

  variants: {
    variant: { values: ['primary', 'secondary', 'danger'], default: 'primary' },
    size: { values: ['sm', 'md', 'lg'], default: 'md' },
  },
  states: ['hover', 'focus-visible', 'disabled', 'loading'],

  slots: { children: { required: true } },

  tokens: {
    base: {
      fontFamily: '{typography.body-family}',
      borderRadius: '{button.radius}',
    },
    variants: {
      variant: {
        primary: {
          background: '{button.primary.background}',
          color: '{button.primary.foreground}',
          states: {
            hover: { background: '{button.primary.background-hover}' },
          },
        },
        secondary: {
          background: '{button.secondary.background}',
          color: '{button.secondary.foreground}',
          borderColor: '{button.secondary.border}',
        },
        danger: {
          background: '{button.danger.background}',
          color: '{button.danger.foreground}',
          states: {
            hover: { background: '{button.danger.background-hover}' },
          },
        },
      },
      size: {
        sm: { height: '{button.size.sm.height}', paddingInline: '{control.padding-inline-sm}', fontSize: '{typography.size-sm}' },
        md: { height: '{button.size.md.height}', paddingInline: '{control.padding-inline-md}', fontSize: '{typography.size-md}' },
        lg: { height: '{button.size.lg.height}', paddingInline: '{control.padding-inline-lg}', fontSize: '{typography.size-lg}' },
      },
    },
  },

  accessibility: {
    focusable: true,
    aria: {
      loading: { 'aria-busy': 'true' },
    },
  },

  extensibility: {
    allowExtends: true,
    overridableTokens: ['background', 'color', 'borderColor'],
  },
});
