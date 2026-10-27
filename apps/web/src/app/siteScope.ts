import { createContext, useContext } from 'react';

/** The site chosen in the client shell's switcher: a site id, or 'all'. Kept while moving between pages. */
export const SiteScopeContext = createContext<string>('all');
export const useSiteScope = (): string => useContext(SiteScopeContext);
