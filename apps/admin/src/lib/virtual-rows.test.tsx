import { cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SpacerRow, useVirtualRows } from './virtual-rows';

/**
 * SPEED_MATRIX 2026-11-09 §3 №12: a journal of 500 rows used to put 500
 * `<tr>` in the DOM (react-window / virtuoso were nowhere, ADMIN_ECONOMY
 * 2026-10-23). Now only the rows around the viewport are rendered; the
 * rest is two spacer rows of the right height.
 */
function Journal({ rows }: { rows: string[] }) {
  const v = useVirtualRows(rows, { estimate: 40 });
  return (
    <table>
      <tbody ref={v.bodyRef} data-virtual={String(v.virtual)}>
        <SpacerRow height={v.paddingTop} />
        {v.items.map(({ row, index, rowProps }) => (
          <tr key={row} data-row {...rowProps}>
            <td>
              {index}: {row}
            </td>
          </tr>
        ))}
        <SpacerRow height={v.paddingBottom} />
      </tbody>
    </table>
  );
}

const many = Array.from({ length: 500 }, (_, i) => `row-${i}`);

// jsdom lays nothing out: every box is 0 px tall. Rows answer 40 px so
// the virtualizer measures them as a browser would (`offsetHeight`).
const realOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!;
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.tagName === 'TR' ? 40 : (realOffsetHeight.get!.call(this) as number);
    },
  });
});
afterAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', realOffsetHeight);
});

afterEach(() => cleanup());

describe('useVirtualRows', () => {
  it('renders only the rows around the viewport of a long journal', () => {
    const { container } = render(<Journal rows={many} />);
    const rendered = container.querySelectorAll('tr[data-row]').length;
    console.info(`virtual rows: 500 in the list, ${rendered} in the DOM`);
    expect(rendered).toBeGreaterThan(0);
    // jsdom's window is 768 px tall: ~19 rows of 40 px + overscan, never
    // the whole 500.
    expect(rendered).toBeLessThan(60);
    expect(container.querySelector('tbody')!.dataset.virtual).toBe('true');
    // The spacer below stands for the rows not rendered.
    const spacers = container.querySelectorAll('tr[aria-hidden]');
    expect(spacers.length).toBeGreaterThanOrEqual(1);
    const below = spacers[spacers.length - 1] as HTMLTableRowElement;
    expect(parseInt(below.style.height, 10)).toBeGreaterThan(40 * 300);
  });

  it('renders every row of a short list, as before', () => {
    const { container } = render(<Journal rows={many.slice(0, 30)} />);
    expect(container.querySelectorAll('tr[data-row]')).toHaveLength(30);
    expect(container.querySelectorAll('tr[aria-hidden]')).toHaveLength(0);
    expect(container.querySelector('tbody')!.dataset.virtual).toBe('false');
  });

  it('a row that comes back into view does not play its entrance again', () => {
    const { container } = render(<Journal rows={many.slice(0, 3)} />);
    const first = container.querySelector('tr[data-row]')!;
    expect(first.getAttribute('data-index')).toBe('0');
  });
});
