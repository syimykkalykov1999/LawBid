import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RowSelectBox, useSelection } from '@/components/bulk/bulk-controls';
import { ErrorNote } from '@/components/page-header';
import { panAbout, swipeStep, wheelZoom } from '@/components/review/lightbox';
import { LinkifiedText } from '@/components/support/linkified-text';
import { toggleRange } from '@/lib/bulk';
import { makeQueryClient } from '@/lib/query-client';

// Detective round 1, owner row 135: the admin UX fixes D1-4 … D1-15.
afterEach(cleanup);

describe('D1-4 mutations never pause offline', () => {
  it('admin actions run with networkMode always', () => {
    const c = makeQueryClient();
    expect(c.getDefaultOptions().mutations?.networkMode).toBe('always');
    expect(c.getDefaultOptions().queries?.networkMode).toBe('offlineFirst');
  });
});

describe('D1-5 ErrorNote retry', () => {
  function Failing({ fn }: { fn: () => Promise<string> }) {
    const q = useQuery({ queryKey: ['d1-5'], queryFn: fn, retry: false });
    return <ErrorNote text={q.error ? 'Сервер не ответил, попробуйте ещё раз.' : null} />;
  }

  it('a failed read gets «Повторить», which re-reads it', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue('ok');
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <Failing fn={fn} />
      </QueryClientProvider>,
    );
    const button = await screen.findByText('Повторить');
    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('an action error with no failed read has no button', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ErrorNote text="Проверьте введённые данные." />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Повторить')).toBeNull();
  });

  it('an explicit onRetry is used as is', () => {
    const onRetry = vi.fn();
    render(<ErrorNote text="Ошибка" onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Повторить'));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('D1-9 lightbox gesture maths', () => {
  it('a small trackpad step zooms a little, not to the cap', () => {
    expect(wheelZoom(1, -4)).toBeCloseTo(1.06);
    expect(wheelZoom(1, 0)).toBe(1);
    expect(wheelZoom(1, 40)).toBe(1);
    expect(wheelZoom(5.9, -100)).toBe(6);
  });

  it('the point under the cursor stays still', () => {
    const c = { x: 500, y: 400 };
    const s = { x: 600, y: 450 };
    const pan = panAbout(s, c, { x: 0, y: 0 }, 1, 2);
    // the image point under s: (s - c - pan0) / z0 = (100, 50); after: c + pan + 2 * q = s
    expect(c.x + pan.x + 2 * 100).toBe(s.x);
    expect(c.y + pan.y + 2 * 50).toBe(s.y);
  });

  it('PhotoSwipe swipe rule', () => {
    expect(swipeStep(-120, 100, 1000)).toBe(1); // fast left → next
    expect(swipeStep(120, 100, 1000)).toBe(-1); // fast right → previous
    expect(swipeStep(-600, 10_000, 1000)).toBe(1); // slow but past half
    expect(swipeStep(-100, 10_000, 1000)).toBe(0); // slow and short → stay
  });
});

describe('D1-13 links in support messages', () => {
  it('http(s) links become safe new-tab links, the rest stays text', () => {
    render(
      <p data-testid="m">
        <LinkifiedText text={'См. https://lawbid.com/case/1 и javascript:alert(1) <b>x</b>'} />
      </p>,
    );
    const a = screen.getByRole('link');
    expect(a.getAttribute('href')).toBe('https://lawbid.com/case/1');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByTestId('m').textContent).toContain('<b>x</b>');
  });
});

describe('D1-14 shift-click range', () => {
  it('toggleRange applies the clicked row state to the range', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    expect([...toggleRange(new Set(['b']), 'b', 'e', order)].sort()).toEqual(['b', 'c', 'd', 'e']);
    expect([...toggleRange(new Set(['a', 'b', 'c']), 'a', 'c', order)]).toEqual([]);
    expect([...toggleRange(new Set(), null, 'c', order)]).toEqual(['c']);
  });

  function List() {
    const sel = useSelection('k');
    const ids = ['a', 'b', 'c', 'd'];
    return (
      <>
        <span data-testid="n">{sel.selected.size}</span>
        {ids.map((id) => (
          <RowSelectBox key={id} selected={sel.selected} id={id} onToggle={sel.toggle} order={() => ids} />
        ))}
      </>
    );
  }

  it('Shift+click ticks every row between', () => {
    render(<List />);
    const rows = screen.getAllByLabelText('Выбрать');
    fireEvent.click(rows[0]!);
    fireEvent.click(rows[3]!, { shiftKey: true });
    expect(screen.getByTestId('n').textContent).toBe('4');
  });
});
