import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/client', () => ({ errorDetail: () => undefined }));

import { DeskEmbed } from '@/components/desk/embed';
import { PageHeader } from './page-header';

afterEach(cleanup);

describe('PageHeader on the desk (staff package T8)', () => {
  it('outside the desk: the big title as ever', () => {
    render(<PageHeader title="Верификация" actions={<button>Обновить</button>} />);
    expect(screen.getByRole('heading', { name: 'Верификация' })).toBeTruthy();
    expect(screen.getByText('Обновить')).toBeTruthy();
  });

  it('inside a desk tab: no title, the page buttons stay', () => {
    render(
      <DeskEmbed>
        <PageHeader title="Верификация" subtitle="x" actions={<button>Обновить</button>} />
      </DeskEmbed>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('Обновить')).toBeTruthy();
  });

  it('inside a desk tab with no buttons: nothing is drawn', () => {
    const { container } = render(
      <DeskEmbed>
        <PageHeader title="Верификация" />
      </DeskEmbed>,
    );
    expect(container.textContent).toBe('');
  });
});
