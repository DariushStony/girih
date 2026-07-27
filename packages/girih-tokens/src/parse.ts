import type { Diagnostic } from '@faravahar/girih-core';
import type { RawToken, TokenFileInput } from './types.js';

interface ParseResult {
  tokens: RawToken[];
  diagnostics: Diagnostic[];
}

const KNOWN_DOLLAR_PROPS = new Set(['$value', '$type', '$description', '$extensions', '$deprecated']);
const CSS_SAFE_NAME = /^[A-Za-z0-9_-]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Walk a DTCG document: a node carrying $value is a token; other keys are groups.
 * Group-level $type is inherited by descendant tokens (DTCG 2025.10 §5.2).
 */
export function parseTokenFile(input: TokenFileInput): ParseResult {
  const tokens: RawToken[] = [];
  const diagnostics: Diagnostic[] = [];

  if (!isPlainObject(input.contents)) {
    diagnostics.push({
      code: 'GIRIH2001',
      severity: 'error',
      message: 'Token file must be a JSON object at the top level.',
      file: input.file,
    });
    return { tokens, diagnostics };
  }

  const walk = (node: Record<string, unknown>, segments: string[], inheritedType: string | undefined): void => {
    const groupType = typeof node.$type === 'string' ? node.$type : inheritedType;

    if ('$value' in node) {
      const path = segments.join('.');
      for (const key of Object.keys(node)) {
        if (!key.startsWith('$')) {
          diagnostics.push({
            code: 'GIRIH2009',
            severity: 'error',
            message: `'${path}' is a token (it has a $value) but also contains '${key}' — tokens cannot nest groups or other tokens.`,
            file: input.file,
            path,
            help: `Move '${key}' out to a sibling group, e.g. '${path}-${key}'.`,
          });
        }
      }
      const token: RawToken = {
        path,
        value: node.$value,
        type: groupType,
        tier: input.tier,
        file: input.file,
      };
      if (typeof node.$description === 'string') token.description = node.$description;
      tokens.push(token);
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$')) {
        if (!KNOWN_DOLLAR_PROPS.has(key)) {
          diagnostics.push({
            code: 'GIRIH2008',
            severity: 'warning',
            message: `Unknown '$'-prefixed property '${key}' is ignored (the '$' prefix is reserved by DTCG).`,
            file: input.file,
            path: segments.join('.') || '(root)',
            help: `Known properties: ${[...KNOWN_DOLLAR_PROPS].join(', ')}. Rename the key if it was meant to be a group.`,
          });
        }
        continue;
      }
      if (key.includes('.') || key.includes('{') || key.includes('}')) {
        diagnostics.push({
          code: 'GIRIH2002',
          severity: 'error',
          message: `Token or group name '${key}' contains a character forbidden by DTCG ('.', '{', '}').`,
          file: input.file,
          path: [...segments, key].join('.'),
        });
        continue;
      }
      if (!CSS_SAFE_NAME.test(key)) {
        diagnostics.push({
          code: 'GIRIH2007',
          severity: 'warning',
          message: `Token or group name '${key}' contains characters that do not translate cleanly to CSS variable names.`,
          file: input.file,
          path: [...segments, key].join('.'),
          help: 'Stick to lowercase letters, digits, "-" and "_" so generated names stay predictable.',
        });
      }
      if (!isPlainObject(child)) {
        diagnostics.push({
          code: 'GIRIH2003',
          severity: 'error',
          message: `'${[...segments, key].join('.')}' is a bare ${typeof child}; tokens must be objects with a $value.`,
          file: input.file,
          path: [...segments, key].join('.'),
          help: `Write it as { "$value": ${JSON.stringify(child)} }.`,
        });
        continue;
      }
      walk(child, [...segments, key], groupType);
    }
  };

  walk(input.contents, [], undefined);
  return { tokens, diagnostics };
}
