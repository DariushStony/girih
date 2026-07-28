import { defineSpec } from '@faravahar/girih';

export default defineSpec({
  name: 'Dialog',
  description: 'Modal dialog — focus trap, dismissal, and aria wiring come from the headless layer.',
  template: 'dialog',

  variants: {
    size: { values: ['sm', 'md', 'lg'], default: 'md' },
  },

  tokens: {
    parts: {
      backdrop: { background: '{dialog.backdrop}' },
      popup: {
        background: '{dialog.surface}',
        color: '{dialog.foreground}',
        borderRadius: '{dialog.radius}',
        padding: '{dialog.padding}',
        gap: '{dialog.gap}',
        fontFamily: '{typography.body-family}',
      },
      title: { fontSize: '{typography.size-lg}', fontWeight: '{typography.weight-semibold}', color: '{dialog.title-foreground}' },
      description: { fontSize: '{typography.size-sm}', color: '{dialog.description-foreground}' },
    },
    variants: {
      size: {
        sm: { maxWidth: '{dialog.size.sm.max-width}' },
        md: { maxWidth: '{dialog.size.md.max-width}' },
        lg: { maxWidth: '{dialog.size.lg.max-width}' },
      },
    },
  },

  accessibility: { focusable: false },
});
