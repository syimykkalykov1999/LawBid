import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
const toastError = vi.fn();
vi.mock('@/lib/api/client', () => ({ api: { POST: (...a: unknown[]) => post(...a) } }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ error: toastError, success: vi.fn() }) }));

import { isMasked, RevealValue } from './reveal-value';

const props = { targetType: 'user', targetId: 'u1', field: 'phone' } as const;

describe('RevealValue (staff package T11)', () => {
  beforeEach(() => {
    post.mockReset();
    toastError.mockReset();
  });
  afterEach(cleanup);

  it('an unmasked value shows as is, with no button (owner, finance, switch off)', () => {
    render(<RevealValue value="+14155552680" {...props} />);
    expect(screen.getByText('+14155552680')).toBeTruthy();
    expect(screen.queryByText('Показать полностью')).toBeNull();
  });

  it('a masked value offers the button; the click shows the full value once', async () => {
    post.mockResolvedValue({ data: { data: { field: 'phone', value: '+14155552680', remainingToday: 19 } } });
    render(<RevealValue value="+1 *** ** 80" {...props} />);
    fireEvent.click(screen.getByText('Показать полностью'));
    await waitFor(() => expect(screen.getByText('+14155552680')).toBeTruthy());
    expect(post).toHaveBeenCalledWith('/admin/pii/reveal', {
      body: { targetType: 'user', targetId: 'u1', field: 'phone' },
    });
    expect(screen.queryByText('Показать полностью')).toBeNull();
  });

  it('a refusal (the daily limit) stays masked and tells the admin', async () => {
    post.mockRejectedValue(new Error('limit'));
    render(<RevealValue value="s***@x.io" {...props} field="email" />);
    fireEvent.click(screen.getByText('Показать полностью'));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.getByText(/s\*\*\*@x\.io/)).toBeTruthy();
  });

  it('empty value and mask detection', () => {
    render(<RevealValue value={null} {...props} />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(isMasked('+1 *** ** 80')).toBe(true);
    expect(isMasked('plain')).toBe(false);
  });
});
