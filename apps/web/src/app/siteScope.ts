import { createContext, useContext } from 'react';

/** The site chosen in the client shell's switcher: a site id, or 'all'. Kept while moving between pages. */
export const SiteScopeContext = createContext<string>('all');
export const useSiteScope = (): string => useContext(SiteScopeContext);

/** Changes the switcher, for example when the dashboard opens a site from the comparison. */
export const SetSiteScopeContext = createContext<(siteId: string) => void>(() => undefined);
export const useSetSiteScope = (): ((siteId: string) => void) => useContext(SetSiteScopeContext);
