import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistryActions } from './registry-actions';

/** Owner 2026-11-04 (R-400): the registry button and the copy chips. */
const success = vi.fn();
const error = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success, error }) }));

const card = {
  attorney: { firstName: 'Anna', lastName: 'Lawyer', username: 'lawyer' },
  licenses: [{ stateCode: 'CA', stateName: 'California', barNumber: '123456', lookupUrl: 'https://apps.calbar.ca.gov/attorney/Licensee/Detail/123456' }],
};

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  success.mockReset();
  error.mockReset();
  writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(cleanup);

describe('registry actions (R-400)', () => {
  it('«Открыть реестр штата» opens the API address in the one named tab, without noopener', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({ focus: vi.fn() } as unknown as Window);
    render(<RegistryActions card={card} />);
    fireEvent.click(screen.getByRole('button', { name: /Открыть реестр штата/ }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://apps.calbar.ca.gov/attorney/Licensee/Detail/123456', 'lawbid-registry');
    expect(open.mock.calls[0]).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('when the browser blocks the tab the admin is told', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<RegistryActions card={card} />);
    fireEvent.click(screen.getByRole('button', { name: /Открыть реестр штата/ }));
    expect(error).toHaveBeenCalledTimes(1);
    open.mockRestore();
  });

  it('a state without a registry page shows a disabled «Реестра … нет»', () => {
    render(<RegistryActions card={{ ...card, licenses: [{ stateCode: 'ZZ', stateName: 'Nowhere', barNumber: '1', lookupUrl: null }] }} />);
    const b = screen.getByTestId('registry-open') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.textContent).toContain('Реестра ZZ нет');
  });

  it('each chip copies its value and shows the usual toast', async () => {
    render(<RegistryActions card={card} />);
    fireEvent.click(screen.getByTestId('copy-name'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Anna Lawyer'));
    await waitFor(() => expect(success).toHaveBeenCalledWith('Скопировано: ФИО — Anna Lawyer'));
    fireEvent.click(screen.getByTestId('copy-bar'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('123456'));
    fireEvent.click(screen.getByTestId('copy-state'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('CA — California'));
    // no date of birth in the application — no chip
    expect(screen.queryByTestId('copy-birth')).toBeNull();
  });

  it('the overlay tone draws the same controls in the lightbox colours', () => {
    render(<RegistryActions card={card} tone="overlay" />);
    expect(screen.getByTestId('registry-open').className).toContain('text-white');
    expect(screen.getByTestId('copy-name').className).toContain('text-white');
  });
});
