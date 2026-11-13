import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SortTh, Table } from '@/components/ui/table';
import { compareValues, nextSort, parseSort, sortRows, useTableSort, withSort } from './table-sort';

/** Owner 2026-11-12 (row 57): click-to-sort headers in the admin lists. */
const KEYS = ['name', 'amount', 'created'] as const;

describe('sort state in the address', () => {
  it('reads «key.dir», ignores anything unknown (= the default order)', () => {
    expect(parseSort('amount.desc', KEYS)).toEqual({ key: 'amount', dir: 'desc' });
    expect(parseSort('name', KEYS)).toEqual({ key: 'name', dir: 'asc' });
    expect(parseSort('nope.asc', KEYS).key).toBeNull();
    expect(parseSort('name.sideways', KEYS).key).toBeNull();
    expect(parseSort(null, KEYS).key).toBeNull();
  });

  it('a click goes ascending → descending → back to the default; another column starts ascending', () => {
    const a = nextSort(parseSort(null, KEYS), 'name');
    expect(a).toEqual({ key: 'name', dir: 'asc' });
    const b = nextSort(a, 'name');
    expect(b).toEqual({ key: 'name', dir: 'desc' });
    expect(nextSort(b, 'name').key).toBeNull();
    expect(nextSort(b, 'amount')).toEqual({ key: 'amount', dir: 'asc' });
  });

  it('keeps the other query parameters and drops its own for the default order', () => {
    expect(withSort('?status=open', 'sort', { key: 'name', dir: 'desc' })).toBe('?status=open&sort=name.desc');
    expect(withSort('?status=open&sort=name.desc', 'sort', { key: null, dir: 'asc' })).toBe('?status=open');
    expect(withSort('', 'paySort', { key: null, dir: 'asc' })).toBe('');
  });
});

describe('sortRows', () => {
  const rows = [
    { id: 1, name: 'Борис', amount: 300, created: '2026-11-02T00:00:00Z' },
    { id: 2, name: 'анна', amount: null, created: '2026-11-03T00:00:00Z' },
    { id: 3, name: 'Вера', amount: 25, created: '2026-11-01T00:00:00Z' },
    { id: 4, name: 'Анна', amount: 25, created: null },
  ];
  const values = { name: (r: (typeof rows)[number]) => r.name, amount: (r: (typeof rows)[number]) => r.amount, created: (r: (typeof rows)[number]) => r.created };
  const ids = (k: (typeof KEYS)[number] | null, dir: 'asc' | 'desc' = 'asc') => sortRows(rows, { key: k, dir }, values).map((r) => r.id);

  it('the default order is the server order, untouched', () => {
    expect(ids(null)).toEqual([1, 2, 3, 4]);
  });
  it('numbers by value, empty cells last in both directions, equal cells keep the server order', () => {
    expect(ids('amount')).toEqual([3, 4, 1, 2]);
    expect(ids('amount', 'desc')).toEqual([1, 3, 4, 2]);
  });
  it('text by Russian alphabet, case-insensitive; dates by time', () => {
    expect(ids('name')).toEqual([2, 4, 1, 3]);
    expect(ids('created')).toEqual([3, 1, 2, 4]);
    expect(ids('created', 'desc')).toEqual([2, 1, 3, 4]);
  });
  it('compares numbers inside text naturally', () => {
    expect(compareValues('заявка 2', 'заявка 10')).toBeLessThan(0);
  });
});

function Harness() {
  const { sort, header } = useTableSort(KEYS, 'listSort');
  const rows = sortRows([{ n: 'b' }, { n: 'a' }, { n: 'c' }], sort, { name: (r) => r.n, amount: () => null, created: () => null });
  return (
    <Table>
      <thead>
        <tr>
          <SortTh {...header('name')}>Имя</SortTh>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.n}>
            <td>{r.n}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
const cells = () => screen.getAllByRole('cell').map((c) => c.textContent);

describe('SortTh + useTableSort', () => {
  beforeEach(() => window.history.replaceState(null, '', '/users?status=open'));
  afterEach(cleanup);

  it('clicks sort the rows, show the direction and keep it in the address', () => {
    render(<Harness />);
    const th = screen.getByRole('columnheader');
    expect(th.getAttribute('aria-sort')).toBe('none');
    expect(cells()).toEqual(['b', 'a', 'c']);
    act(() => fireEvent.click(screen.getByRole('button', { name: /Имя/ })));
    expect(th.getAttribute('aria-sort')).toBe('ascending');
    expect(cells()).toEqual(['a', 'b', 'c']);
    expect(window.location.search).toBe('?status=open&listSort=name.asc');
    act(() => fireEvent.click(screen.getByRole('button', { name: /Имя/ })));
    expect(th.getAttribute('aria-sort')).toBe('descending');
    expect(cells()).toEqual(['c', 'b', 'a']);
    act(() => fireEvent.click(screen.getByRole('button', { name: /Имя/ })));
    expect(th.getAttribute('aria-sort')).toBe('none');
    expect(cells()).toEqual(['b', 'a', 'c']);
    expect(window.location.search).toBe('?status=open');
  });

  it('opens already sorted from the address (a reload or a shared link)', () => {
    window.history.replaceState(null, '', '/users?listSort=name.desc');
    render(<Harness />);
    expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe('descending');
    expect(cells()).toEqual(['c', 'b', 'a']);
  });
});
