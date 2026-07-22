import { defineSpec } from '@girih/cli';

export default defineSpec({
  name: 'Input',
  description: 'Single-line text input.',
  element: 'input',

  variants: {
    size: { values: ['sm', 'md', 'lg'], default: 'md' },
  },
  states: ['hover', 'focus-visible', 'disabled'],

  tokens: {
    base: {
      background: '{input.background}',
      color: '{input.foreground}',
      border: '{input.border}',
      borderRadius: '{input.radius}',
      fontFamily: '{typography.body-family}',
    },
    states: {
      'focus-visible': { borderColor: '{input.border-focus}' },
    },
    variants: {
      size: {
        sm: { height: '{input.size.sm.height}', paddingInline: '{control.padding-inline-sm}', fontSize: '{typography.size-sm}' },
        md: { height: '{input.size.md.height}', paddingInline: '{control.padding-inline-md}', fontSize: '{typography.size-md}' },
        lg: { height: '{input.size.lg.height}', paddingInline: '{control.padding-inline-lg}', fontSize: '{typography.size-lg}' },
      },
    },
  },

  accessibility: { focusable: true },
});
