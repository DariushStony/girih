import { describe, expect, it } from 'vitest';
import { parseTokenFile } from '@faravahar/girih-tokens';

const file = (contents: unknown) => ({ file: 'tokens/test.tokens.json', tier: 'global' as const, contents });

describe('parseTokenFile', () => {
  it('parses tokens and inherits group-level $type', () => {
    const { tokens, diagnostics } = parseTokenFile(
      file({
        color: {
          $type: 'color',
          blue: { 500: { $value: '#3B82F6' } },
          primary: { $value: '{color.blue.500}', $type: 'color' },
        },
        radius: { md: { $value: '8px', $type: 'dimension', $description: 'medium radius' } },
      }),
    );
    expect(diagnostics).toEqual([]);
    expect(tokens).toHaveLength(3);
    const byPath = new Map(tokens.map((t) => [t.path, t]));
    expect(byPath.get('color.blue.500')).toMatchObject({ value: '#3B82F6', type: 'color', tier: 'global' });
    expect(byPath.get('radius.md')).toMatchObject({ type: 'dimension', description: 'medium radius' });
  });

  it('rejects bare values that are not wrapped in $value objects', () => {
    const { tokens, diagnostics } = parseTokenFile(file({ color: { primary: '#FF0000' } }));
    expect(tokens).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: 'GIRIH2003', severity: 'error', path: 'color.primary' });
  });

  it('rejects names containing DTCG-forbidden characters', () => {
    const { diagnostics } = parseTokenFile(file({ 'color.primary': { $value: '#FF0000' } }));
    expect(diagnostics[0]).toMatchObject({ code: 'GIRIH2002', severity: 'error' });
  });

  it('rejects a non-object top level', () => {
    const { diagnostics } = parseTokenFile(file(['not', 'an', 'object']));
    expect(diagnostics[0]).toMatchObject({ code: 'GIRIH2001', severity: 'error' });
  });
});
