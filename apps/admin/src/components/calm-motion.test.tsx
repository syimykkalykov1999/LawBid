import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { domMax, LazyMotion, MotionConfig } from 'motion/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/client', () => ({ errorDetail: () => undefined, errorText: (e: unknown) => String(e) }));
// motion reads prefers-reduced-motion once per page; the test flips it per case.
let reduced = false;
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => reduced }));

import { fadeUp } from '@/components/billing/shared';
import { FadeIn, MotionRow } from '@/components/legacy/fade-in';
import { PageHeader } from '@/components/page-header';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Tabs } from '@/components/ui/tabs';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { disableAnimation, ThemeProvider, useTheme } from '@/lib/theme';

// Owner row 88 (2026-11-13): calmer admin motion. Content is there at once on
// navigation; only changes the user caused move.

beforeEach(() => {
  reduced = false;
  window.matchMedia = ((q: string) => ({
    matches: q.includes('reduce') ? reduced : false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const wrap = (ui: React.ReactNode) =>
  render(
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domMax}>{ui}</LazyMotion>
    </MotionConfig>,
  );

/** An element that starts hidden (an entrance) has inline opacity 0. */
const startsHidden = (el: Element | null) => (el as HTMLElement | null)?.style.opacity === '0';

describe('no entrance on navigation', () => {
  it('PageHeader is shown at once (no fade or rise)', () => {
    wrap(<PageHeader title="Пользователи" />);
    const box = screen.getByRole('heading', { name: 'Пользователи' }).parentElement?.parentElement ?? null;
    expect(startsHidden(box)).toBe(false);
    expect((box as HTMLElement).style.transform).not.toContain('translate');
  });

  it('FadeIn and fadeUp cards are shown at once', () => {
    const { container } = wrap(
      <>
        <FadeIn i={3}>
          <span>card</span>
        </FadeIn>
      </>,
    );
    expect(startsHidden(container.firstElementChild)).toBe(false);
    expect(fadeUp(5).initial).toBe(false);
  });

  it('MotionRow does not fade in (rows mounted by VirtualRows on scroll do not flicker)', () => {
    const { container } = wrap(
      <table>
        <tbody>
          {[0, 1, 2].map((i) => (
            <MotionRow key={i} i={i}>
              <td>row {i}</td>
            </MotionRow>
          ))}
        </tbody>
      </table>,
    );
    const rows = [...container.querySelectorAll('tr')];
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(startsHidden(r)).toBe(false);
  });
});

describe('AnimatedNumber', () => {
  it('shows the real value at once (no count from 0)', () => {
    const { container } = wrap(<AnimatedNumber value={12345} />);
    expect(container.textContent?.replace(/\s/g, '')).toBe('12345');
  });

  it('with «reduce motion» a new value is shown at once', async () => {
    reduced = true;
    function Box() {
      const [v, setV] = useState(10);
      return (
        <>
          <AnimatedNumber value={v} />
          <button onClick={() => setV(20)}>more</button>
        </>
      );
    }
    wrap(<Box />);
    expect(screen.getByText('10')).toBeTruthy();
    fireEvent.click(screen.getByText('more'));
    // jump(): the next frame shows 20, with no tween in between.
    await vi.waitFor(() => expect(screen.getByText('20')).toBeTruthy(), { timeout: 100 });
  });
});

describe('Tabs', () => {
  it('the strip is still one tablist with the selected tab', () => {
    wrap(
      <Tabs
        value="b"
        onChange={() => {}}
        items={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    );
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'B' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('Toasts', () => {
  function Pusher() {
    const t = useToast();
    return <button onClick={() => t.success('Сохранено')}>push</button>;
  }

  it('sit above the bottom bar on phones and at the corner on desktop', () => {
    wrap(
      <ToastProvider>
        <Pusher />
      </ToastProvider>,
    );
    const live = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live.className).toContain('bottom-[calc(4.5rem+env(safe-area-inset-bottom))]');
    expect(live.className).toContain('lg:bottom-4');
  });

  it('a toast appears and the close button removes it', async () => {
    wrap(
      <ToastProvider>
        <Pusher />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('push'));
    expect(screen.getByText('Сохранено')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Закрыть'));
    await vi.waitFor(() => expect(screen.queryByText('Сохранено')).toBeNull());
  });
});

describe('theme switch (next-themes disableTransitionOnChange)', () => {
  it('turns transitions off for one tick, then removes the style', () => {
    vi.useFakeTimers();
    const before = document.head.querySelectorAll('style').length;
    const enable = disableAnimation();
    const added = [...document.head.querySelectorAll('style')].pop();
    expect(document.head.querySelectorAll('style').length).toBe(before + 1);
    expect(added?.textContent).toContain('transition:none!important');
    enable();
    vi.advanceTimersByTime(1);
    expect(document.head.querySelectorAll('style').length).toBe(before);
  });

  it('toggling the theme no longer puts a transition class on <html>', () => {
    vi.useFakeTimers();
    function T() {
      const { toggle } = useTheme();
      return <button onClick={toggle}>theme</button>;
    }
    render(
      <ThemeProvider>
        <T />
      </ThemeProvider>,
    );
    const wasDark = document.documentElement.classList.contains('dark');
    act(() => {
      fireEvent.click(screen.getByText('theme'));
    });
    expect(document.documentElement.classList.contains('dark')).toBe(!wasDark);
    expect(document.documentElement.classList.contains('theme-switching')).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
  });
});
