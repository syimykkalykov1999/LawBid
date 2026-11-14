import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { domMax, LazyMotion, MotionConfig, motionValue } from 'motion/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/client', () => ({ errorDetail: () => undefined, errorText: (e: unknown) => String(e) }));
const linkProps: Record<string, unknown>[] = [];
vi.mock('next/link', () => ({
  default: ({ children, transitionTypes, ...rest }: { children: React.ReactNode; transitionTypes?: string[] } & Record<string, unknown>) => {
    linkProps.push({ href: rest.href, transitionTypes });
    const { href, className, role, onClick } = rest as Record<string, never>;
    return (
      <a href={href} className={className} role={role} onClick={onClick}>
        {children}
      </a>
    );
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/users' }));

import { ProgressBar } from '@/components/billing/shared';
import { MotionRow } from '@/components/legacy/fade-in';
import { Dialog } from '@/components/ui/dialog';
import { RowMenu } from '@/components/ui/menu';
import { OverflowTabs } from '@/components/ui/overflow-tabs';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { useDragDismiss } from '@/lib/drag-dismiss';
import { NAV_TRANSITION } from '@/lib/nav-transition';
import { lockAttribute, lockScroll } from '@/lib/scroll-lock';

// Owner row 88 (2026-11-13): the rest of the web animations audit (admin).

let phone = false;
beforeEach(() => {
  phone = false;
  window.matchMedia = ((q: string) => ({
    matches: q.includes('max-width') ? phone : false,
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
  linkProps.length = 0;
  document.body.removeAttribute('style');
});

const wrap = (ui: React.ReactNode) =>
  render(
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domMax}>{ui}</LazyMotion>
    </MotionConfig>,
  );

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

function Nested() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(true);
  return (
    <>
      <button type="button">opener</button>
      <Dialog open={a} onClose={() => setA(false)} title="Первый">
        <button type="button">first-field</button>
      </Dialog>
      <Dialog open={b} onClose={() => setB(false)} title="Второй">
        <button type="button">second-field</button>
      </Dialog>
    </>
  );
}

describe('dialog behaviour (Radix FocusScope / DismissableLayer, react-remove-scroll-bar)', () => {
  it('Esc closes only the dialog on top, the next Esc the one under it', async () => {
    wrap(<Nested />);
    await flush();
    expect(screen.getByText('Второй')).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.queryByText('Второй')).toBeNull());
    expect(screen.getByText('Первый')).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.queryByText('Первый')).toBeNull());
  });

  it('an Esc of an input method (IME composition) closes nothing', async () => {
    wrap(<Nested />);
    await flush();
    fireEvent.keyDown(document.body, { key: 'Escape', keyCode: 229 });
    await flush();
    expect(screen.getByText('Второй')).toBeTruthy();
  });

  it('a menu inside a dialog closes alone on Esc', async () => {
    function WithMenu() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog open={open} onClose={() => setOpen(false)} title="Карточка">
          <RowMenu items={[{ label: 'Удалить', onSelect: () => {} }]} />
        </Dialog>
      );
    }
    wrap(<WithMenu />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Действия' }));
    await flush();
    expect(screen.getByText('Удалить')).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.queryByText('Удалить')).toBeNull());
    await flush();
    expect(screen.getByText('Карточка')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('focus moves into the dialog, Tab wraps inside it, and goes back to the opener on close', async () => {
    function One() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Открыть
          </button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Форма">
            <input aria-label="Имя" />
            <button type="button">Сохранить</button>
          </Dialog>
        </>
      );
    }
    wrap(<One />);
    const opener = screen.getByRole('button', { name: 'Открыть' });
    opener.focus();
    fireEvent.click(opener);
    await flush();
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);
    const save = screen.getByRole('button', { name: 'Сохранить' });
    save.focus();
    // Tab on the last control goes round to the first one (the ✕).
    fireEvent.keyDown(save, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Закрыть' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(save);
    // Focus that leaves the dialog comes back.
    act(() => opener.focus());
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await vi.waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('the page keeps its width: the removed scrollbar comes back as body padding, once for nested locks', () => {
    const iw = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1015);
    const cw = vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000);
    const outer = lockScroll();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.paddingRight).toBe('15px');
    expect(document.body.hasAttribute(lockAttribute)).toBe(true);
    const inner = lockScroll();
    inner();
    expect(document.body.style.overflow).toBe('hidden'); // the outer dialog is still open
    outer();
    expect(document.body.style.overflow).toBe('');
    expect(document.body.style.paddingRight).toBe('');
    expect(document.body.hasAttribute(lockAttribute)).toBe(false);
    iw.mockRestore();
    cw.mockRestore();
  });
});

describe('phone dialog = bottom sheet (vaul)', () => {
  it('on phones the panel starts below the screen (slides up), on desktop it rises 24 px', async () => {
    phone = true;
    const { unmount } = wrap(
      <Dialog open onClose={() => {}} title="Лист">
        x
      </Dialog>,
    );
    await flush();
    // First frames of the slide: still (almost) a whole screen below.
    expect(screen.getByRole('dialog').style.transform).toMatch(/translateY\((9\d|100)(\.\d+)?%\)/);
    unmount();
    phone = false;
    wrap(
      <Dialog open onClose={() => {}} title="Окно">
        x
      </Dialog>,
    );
    await flush();
    // First frames of the rise: about 24 px below (the animation may have
    // moved a fraction of a pixel by the time the test reads it, CI 14.11).
    const rise = /translateY\(([\d.]+)px\)/.exec(screen.getByRole('dialog').style.transform);
    expect(Number(rise?.[1])).toBeGreaterThan(20);
    expect(Number(rise?.[1])).toBeLessThanOrEqual(24);
  });
});

/** A fake pointer event for the drag handlers (jsdom has no pointer geometry). */
const ev = (target: HTMLElement, pageX: number, pageY: number) =>
  ({ currentTarget: target, target, pageX, pageY, pointerId: 1 }) as unknown as React.PointerEvent<HTMLElement>;

function panelEl(h = 800, w = 284) {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ height: h, width: w, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) });
  document.body.appendChild(el);
  return el;
}

describe('drag to close (vaul thresholds)', () => {
  const setup = (direction: 'bottom' | 'left') => {
    const offset = motionValue<number | string>(0);
    const onClose = vi.fn();
    const { result } = renderHook(() => useDragDismiss({ offset, direction, enabled: true, onClose }));
    return { offset, onClose, result };
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
  });

  it('a slow pull past 25 % of the sheet closes it; a short one snaps back', () => {
    const { onClose, result, offset } = setup('bottom');
    const el = panelEl();
    result.current.markOpened();
    vi.setSystemTime(Date.now() + 600);
    // short: 100 px of 800 in 1 s
    result.current.handlers.onPointerDown!(ev(el, 0, 100));
    vi.setSystemTime(Date.now() + 1000);
    result.current.handlers.onPointerMove!(ev(el, 0, 200));
    expect(offset.get()).toBe(100);
    result.current.handlers.onPointerUp!(ev(el, 0, 200));
    expect(onClose).not.toHaveBeenCalled();
    // long: 300 px of 800 in 1 s
    result.current.handlers.onPointerDown!(ev(el, 0, 100));
    vi.setSystemTime(Date.now() + 1000);
    result.current.handlers.onPointerMove!(ev(el, 0, 400));
    result.current.handlers.onPointerUp!(ev(el, 0, 400));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a quick flick (> 0.4 px/ms) closes even when short', () => {
    const { onClose, result } = setup('bottom');
    const el = panelEl();
    result.current.markOpened();
    vi.setSystemTime(Date.now() + 600);
    result.current.handlers.onPointerDown!(ev(el, 0, 100));
    vi.setSystemTime(Date.now() + 50);
    result.current.handlers.onPointerMove!(ev(el, 0, 160));
    result.current.handlers.onPointerUp!(ev(el, 0, 160));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('no drag in the first 500 ms after opening, nor while the content is scrolled', () => {
    const { onClose, result, offset } = setup('bottom');
    const el = panelEl();
    result.current.markOpened();
    result.current.handlers.onPointerDown!(ev(el, 0, 100));
    result.current.handlers.onPointerMove!(ev(el, 0, 500));
    result.current.handlers.onPointerUp!(ev(el, 0, 500));
    expect(onClose).not.toHaveBeenCalled();
    expect(offset.get()).toBe(0);

    vi.setSystemTime(Date.now() + 600);
    const scroller = document.createElement('div');
    el.appendChild(scroller);
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000 });
    Object.defineProperty(scroller, 'clientHeight', { value: 500 });
    scroller.scrollTop = 40;
    result.current.handlers.onPointerDown!(ev(el, 0, 100));
    result.current.handlers.onPointerMove!(ev(scroller, 0, 500));
    result.current.handlers.onPointerUp!(ev(scroller, 0, 500));
    expect(onClose).not.toHaveBeenCalled();
    expect(offset.get()).toBe(0);
  });

  it('side menu: a swipe to the left closes it, a vertical scroll never turns into a swipe', () => {
    const { onClose, result, offset } = setup('left');
    const el = panelEl();
    result.current.handlers.onPointerDown!(ev(el, 200, 100));
    result.current.handlers.onPointerMove!(ev(el, 196, 160)); // mostly vertical
    result.current.handlers.onPointerMove!(ev(el, 20, 160));
    result.current.handlers.onPointerUp!(ev(el, 20, 160));
    expect(onClose).not.toHaveBeenCalled();
    expect(offset.get()).toBe(0);

    result.current.handlers.onPointerDown!(ev(el, 200, 100));
    vi.setSystemTime(Date.now() + 1000);
    result.current.handlers.onPointerMove!(ev(el, 100, 102));
    expect(offset.get()).toBe(-100);
    result.current.handlers.onPointerUp!(ev(el, 100, 102));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('cheap motion and press feedback', () => {
  it('ProgressBar moves by transform (shadcn Progress), not width', () => {
    const { container } = render(<ProgressBar value={0.25} />);
    const fill = container.firstElementChild!.firstElementChild as HTMLElement;
    expect(fill.style.transform).toBe('translateX(-75%)');
    expect(fill.style.width).toBe('');
    expect(fill.className).toContain('transition-transform');
  });

  it('a row that opens something dims under a finger; a plain row does not', () => {
    wrap(
      <table>
        <tbody>
          <MotionRow onClick={() => {}}>
            <td>открыть</td>
          </MotionRow>
          <MotionRow>
            <td>просто</td>
          </MotionRow>
        </tbody>
      </table>,
    );
    expect(screen.getByText('открыть').closest('tr')!.className).toContain('pointer-coarse:active:opacity-70');
    expect(screen.getByText('просто').closest('tr')!.className).not.toContain('active:');
  });

  it('section tabs carry the page-crossfade type', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    render(<OverflowTabs items={[{ href: '/users', label: 'Пользователи' }, { href: '/cases', label: 'Дела' }]} />);
    const tabs = linkProps.filter((p) => p.href === '/users' || p.href === '/cases');
    expect(tabs.length).toBeGreaterThan(0);
    for (const t of tabs) expect(t.transitionTypes).toEqual([NAV_TRANSITION]);
    vi.unstubAllGlobals();
  });
});

describe('toasts pause like sonner', () => {
  function Pusher() {
    const t = useToast();
    return (
      <button type="button" onClick={() => t.success('Сохранено')}>
        push
      </button>
    );
  }

  it('the countdown stops while the pointer is over the toast and goes on after', async () => {
    vi.useFakeTimers();
    wrap(
      <ToastProvider>
        <Pusher />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('push'));
    const toast = screen.getByText('Сохранено').parentElement!;
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByText('Сохранено')).not.toBeNull();
    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(2700));
    expect(screen.queryByText('Сохранено')).not.toBeNull(); // 2.8 s were left
    act(() => vi.advanceTimersByTime(200));
    vi.useRealTimers(); // the exit animation runs on real frames
    await vi.waitFor(() => expect(screen.queryByText('Сохранено')).toBeNull());
  });
});
