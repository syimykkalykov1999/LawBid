'use client';

import { createContext, useContext } from 'react';

/**
 * Staff package T8: a queue page shown as a tab of the one-page desk. The
 * page keeps all its own panels; only the things that would be doubled on
 * the desk (the big page title, the page's own sub-menu, its own «Следующий»
 * button) step aside while this context is on.
 */
const EmbedContext = createContext(false);

export function DeskEmbed({ children }: { children: React.ReactNode }) {
  return <EmbedContext.Provider value>{children}</EmbedContext.Provider>;
}

export function useDeskEmbed(): boolean {
  return useContext(EmbedContext);
}
