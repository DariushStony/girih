import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

const BrandContext = createContext<string | undefined>(undefined);

export interface BrandProviderProps {
  brand: string;
  children: ReactNode;
}

/**
 * Scopes a subtree to a brand. Generated CSS ships every brand as a
 * [data-brand="x"] block, so switching brands is pure CSS cascade — this
 * wrapper only stamps the attribute (display:contents keeps layout intact).
 */
export function BrandProvider({ brand, children }: BrandProviderProps) {
  return (
    <BrandContext.Provider value={brand}>
      <div data-brand={brand} style={{ display: 'contents' }}>
        {children}
      </div>
    </BrandContext.Provider>
  );
}

/** The nearest BrandProvider's brand, or undefined outside any provider (the default brand). */
export function useBrand(): string | undefined {
  return useContext(BrandContext);
}

/** Join truthy class names. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
