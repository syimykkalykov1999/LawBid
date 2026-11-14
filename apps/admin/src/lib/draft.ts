'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Detective D1-7 (13.11): a half-written text survives a link, a reload or
 * a 401 trip to /login (Gmail / Zendesk / Intercom keep reply drafts the
 * same way). The text lives in this tab's sessionStorage under [key], so
 * it never outlives the tab and is never sent anywhere; storage that is
 * blocked or full just keeps the text in memory. `clear()` after a send.
 */
export function useDraft(key: string | undefined, initial = ''): [string, (v: string) => void, () => void] {
  // Read after mount (the server render has no storage, so no hydration
  // mismatch); another key (the next ticket in a queue) loads its own draft.
  const [value, setValue] = useState<string>(initial);
  useEffect(() => {
    if (key) setValue(readDraft(key) ?? initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new key reloads
  }, [key]);
  const set = useCallback(
    (v: string) => {
      setValue(v);
      if (key) writeDraft(key, v);
    },
    [key],
  );
  const clear = useCallback(() => {
    setValue(initial);
    if (key) writeDraft(key, '');
  }, [initial, key]);
  return [value, set, clear];
}

export function readDraft(key: string): string | null {
  try {
    return window.sessionStorage.getItem(`draft:${key}`);
  } catch {
    return null;
  }
}

export function writeDraft(key: string, v: string): void {
  try {
    if (v) window.sessionStorage.setItem(`draft:${key}`, v);
    else window.sessionStorage.removeItem(`draft:${key}`);
  } catch {
    // Blocked or full storage: the text stays in memory only.
  }
}
