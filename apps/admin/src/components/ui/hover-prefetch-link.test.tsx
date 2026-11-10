import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const seen: unknown[] = [];
vi.mock('next/link', () => ({
  default: ({ prefetch, children, ...rest }: { prefetch?: unknown; children: React.ReactNode } & Record<string, unknown>) => {
    seen.push(prefetch);
    return <a {...(rest as Record<string, unknown>)}>{children}</a>;
  },
}));

import { HoverPrefetchLink } from './hover-prefetch-link';

afterEach(() => {
  cleanup();
  seen.length = 0;
});

describe('HoverPrefetchLink (Next.js docs recipe; Lighthouse 2026-11-09)', () => {
  it('does not prefetch on render, prefetches by default once the pointer arrives', () => {
    const onMouseEnter = vi.fn();
    render(<HoverPrefetchLink href="/users" onMouseEnter={onMouseEnter}>Пользователи</HoverPrefetchLink>);
    expect(seen.at(-1)).toBe(false);
    fireEvent.mouseEnter(screen.getByText('Пользователи'));
    expect(seen.at(-1)).toBeNull();
    expect(onMouseEnter).toHaveBeenCalledTimes(1);
  });

  it.each(['focus', 'touchStart'] as const)('%s counts as intent too', (ev) => {
    render(<HoverPrefetchLink href="/cases">Дела</HoverPrefetchLink>);
    expect(seen.at(-1)).toBe(false);
    fireEvent[ev](screen.getByText('Дела'));
    expect(seen.at(-1)).toBeNull();
  });
});
