import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const counts = vi.fn();
vi.mock('./use-nav-counts', () => ({ useNavCounts: () => counts() }));

import { pendingTotal, tabTitle, useTabTitle } from './use-tab-title';

afterEach(() => {
  cleanup();
  counts.mockReset();
  document.title = '';
});

describe('browser tab title with the pending count', () => {
  it('«(3) Адвокаты — LawBid Admin»; nothing waiting = no number', () => {
    expect(tabTitle('Адвокаты', 3)).toBe('(3) Адвокаты — LawBid Admin');
    expect(tabTitle('Адвокаты', 0)).toBe('Адвокаты — LawBid Admin');
    expect(tabTitle(undefined, 0)).toBe('LawBid Admin');
    expect(tabTitle(undefined, 5000)).toBe('(999+) LawBid Admin');
  });

  it('adds only the counters this admin sees', () => {
    expect(pendingTotal({ verification: 2, support: 1, reports: undefined })).toBe(3);
    expect(pendingTotal({})).toBe(0);
  });

  it('sets document.title from the counts already polled (no request of its own)', () => {
    counts.mockReturnValue({ verification: 2, support: 1 });
    renderHook(() => useTabTitle(undefined, '/verification'));
    expect(document.title).toBe('(3) Адвокаты — LawBid Admin');
  });

  it('puts the title back when the head rewrites it', async () => {
    counts.mockReturnValue({ support: 4 });
    renderHook(() => useTabTitle(undefined, '/support'));
    const want = document.title;
    expect(want.startsWith('(4) ')).toBe(true);
    document.title = 'LawBid Admin';
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.title).toBe(want);
  });
});
