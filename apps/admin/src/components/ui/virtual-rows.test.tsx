import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { VirtualRows, VIRTUAL_ROWS_MIN } from './virtual-rows';

afterEach(cleanup);

// jsdom has no layout: every row measures 40 px high (the estimate), so the
// virtualizer sees a 768 px window (jsdom's innerHeight) over 40 px rows.
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    const h = this.tagName === 'TR' ? 40 : 0;
    return { x: 0, y: 0, top: 0, left: 0, bottom: h, right: 0, width: 0, height: h, toJSON: () => ({}) } as DOMRect;
  };
});

function List({ n }: { n: number }) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));
  return (
    <table>
      <tbody>
        <VirtualRows rows={rows} colSpan={2} estimateSize={40}>
          {(r, i, vp) => (
            <tr key={r.id} {...vp} data-testid="row">
              <td>{r.id}</td>
              <td>{i}</td>
            </tr>
          )}
        </VirtualRows>
      </tbody>
    </table>
  );
}

describe('VirtualRows (admin speed gaps D-c5, @tanstack/react-virtual)', () => {
  it('a short list is rendered whole, exactly as before', () => {
    const { getAllByTestId, container } = render(<List n={VIRTUAL_ROWS_MIN - 1} />);
    expect(getAllByTestId('row')).toHaveLength(VIRTUAL_ROWS_MIN - 1);
    expect(container.querySelectorAll('tr[aria-hidden]')).toHaveLength(0);
  });

  it('a long list draws only a window of rows; every drawn row is the right one', () => {
    // jsdom has no layout, so WHICH window is drawn is not meaningful here; the
    // invariants are: fewer rows than the list, each row in its place with the
    // index the virtualizer measures by, and only spacer rows besides them.
    const { getAllByTestId, container } = render(<List n={500} />);
    const drawn = getAllByTestId('row');
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThan(500);
    for (const tr of drawn) {
      expect(tr.querySelector('td')?.textContent).toBe(`r${tr.getAttribute('data-index')}`);
    }
    const others = [...container.querySelectorAll('tbody > tr')].filter((tr) => !tr.hasAttribute('data-testid'));
    expect(others.every((tr) => tr.getAttribute('aria-hidden') === 'true')).toBe(true);
  });
});
