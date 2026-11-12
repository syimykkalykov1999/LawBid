import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MoreButton } from './more-button';
import { PREFETCH_MARGIN, PrefetchSentinel } from './prefetch-sentinel';

type Report = (entries: Array<{ isIntersecting: boolean }>) => void;

const observers: Array<{ report: Report; margin?: string; disconnected: boolean }> = [];

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private o: (typeof observers)[number];
      constructor(cb: Report, opts?: { rootMargin?: string }) {
        this.o = { report: cb, margin: opts?.rootMargin, disconnected: false };
        observers.push(this.o);
      }
      observe() {}
      unobserve() {}
      disconnect() {
        this.o.disconnected = true;
      }
    },
  );
});

// No vitest globals in the admin: unmount by hand (KNOWN_ERRORS «window is not defined»).
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PrefetchSentinel (item 38)', () => {
  it('asks for the next page when the end comes within the margin, not on open', () => {
    const near = vi.fn();
    render(<PrefetchSentinel enabled onNear={near} />);
    expect(observers).toHaveLength(1);
    expect(observers[0].margin).toBe(`0px 0px ${PREFETCH_MARGIN} 0px`);
    // The first report right after mount: no request (owner: no needless requests).
    act(() => observers[0].report([{ isIntersecting: true }]));
    expect(near).not.toHaveBeenCalled();
    act(() => observers[0].report([{ isIntersecting: false }]));
    act(() => observers[0].report([{ isIntersecting: true }]));
    expect(near).toHaveBeenCalledTimes(1);
  });

  it('does not watch while a page is loading', () => {
    const near = vi.fn();
    const { rerender } = render(<PrefetchSentinel enabled onNear={near} />);
    // The observer always reports once right after observe() (skipped).
    act(() => observers[0].report([{ isIntersecting: false }]));
    rerender(<PrefetchSentinel enabled={false} onNear={near} />);
    expect(observers[0].disconnected).toBe(true);
    expect(observers).toHaveLength(1);
    // Loaded again, the admin still near the end: the next page follows.
    rerender(<PrefetchSentinel enabled onNear={near} />);
    act(() => observers[1].report([{ isIntersecting: true }]));
    expect(near).toHaveBeenCalledTimes(1);
  });

  it('MoreButton keeps its button and adds the sentinel', () => {
    const more = vi.fn();
    const { getByText, getByTestId } = render(<MoreButton show onClick={more} />);
    expect(getByText('Показать ещё')).toBeTruthy();
    expect(getByTestId('prefetch-sentinel')).toBeTruthy();
    act(() => observers[0].report([{ isIntersecting: false }]));
    act(() => observers[0].report([{ isIntersecting: true }]));
    expect(more).toHaveBeenCalledTimes(1);
  });
});
