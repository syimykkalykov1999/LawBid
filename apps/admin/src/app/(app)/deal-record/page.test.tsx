import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';

const calls: { method: string; path: string; body?: unknown; key?: string }[] = [];
let me: { role: string; permissions: Record<string, string>; canManageAdmins: boolean };
let config: unknown[];
let texts: unknown;

vi.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  errorText: (e: unknown) => String(e),
  errorDetail: (t: string) => t,
  api: {
    GET: vi.fn(async (path: string) => ({
      data: { data: path === '/admin/auth/me' ? me : path === '/admin/config' ? config : texts },
    })),
    PUT: vi.fn(async (path: string, init: { params?: { path?: { key: string } }; body: unknown }) => {
      calls.push({ method: 'PUT', path, key: init.params?.path?.key, body: init.body });
      return { data: { data: {} } };
    }),
    POST: vi.fn(async (path: string, init: { body: unknown }) => {
      calls.push({ method: 'POST', path, body: init.body });
      return { data: { data: {} } };
    }),
  },
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import DealRecordPage from './page';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <DealRecordPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  me = { role: 'super_admin', permissions: {}, canManageAdmins: false };
  config = [
    { key: 'deal_record.enabled', type: 'boolean', value: false, defaultValue: false, stored: false },
    { key: 'bids.rich_terms_enabled', type: 'boolean', value: true, defaultValue: false, stored: true },
    { key: 'other.key', type: 'integer', value: 3, defaultValue: 3, stored: false },
  ];
  texts = {
    languages: [
      { code: 'en', name: 'English' },
      { code: 'ru', name: 'Русский' },
    ],
    keys: [
      { key: 'deal_record.pdf.footer', values: { en: 'LawBid is a listing board.' }, edited: [] },
      { key: 'deal_record.consent.not_contract', values: { en: 'This is not a contract', ru: 'Это не договор' }, edited: ['ru'] },
    ],
  };
});
afterEach(cleanup);

describe('deal record page', () => {
  it('shows both switches with their state and saves through /admin/config', async () => {
    renderPage();
    const first = await screen.findByTestId('switch-deal_record.enabled');
    expect(within(first).getByText('Выкл')).toBeTruthy();
    expect(within(first).getByText('не трогали')).toBeTruthy();
    const second = screen.getByTestId('switch-bids.rich_terms_enabled');
    expect(within(second).getByText('Вкл')).toBeTruthy();

    fireEvent.click(within(first).getByRole('switch'));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.key === 'deal_record.enabled')).toBe(true));
    expect(calls.find((c) => c.key === 'deal_record.enabled')?.body).toEqual({ value: true });
  });

  it('edits a text in a language, resets an admin-edited one, and keeps the PDF texts English-only', async () => {
    renderPage();
    const footer = await screen.findByTestId('text-deal_record.pdf.footer');
    const langSelect = within(footer).getByRole('combobox') as HTMLSelectElement;
    expect(langSelect.disabled).toBe(true);
    expect(within(footer).getAllByRole('option')).toHaveLength(1);

    const consent = screen.getByTestId('text-deal_record.consent.not_contract');
    const select = within(consent).getByRole('combobox');
    fireEvent.change(select, { target: { value: 'ru' } });
    await waitFor(() => expect((within(consent).getByRole('textbox') as HTMLTextAreaElement).value).toBe('Это не договор'));
    expect(within(consent).getByText('изменено в админке')).toBeTruthy();

    fireEvent.change(within(consent).getByRole('textbox'), { target: { value: 'Это не договор.' } });
    fireEvent.click(within(consent).getByText('Сохранить'));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PUT',
        path: '/admin/i18n/texts',
        key: undefined,
        body: { key: 'deal_record.consent.not_contract', lang: 'ru', value: 'Это не договор.' },
      }),
    );

    fireEvent.click(within(consent).getByText('Сбросить к встроенному'));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'POST',
        path: '/admin/i18n/texts/reset',
        body: { key: 'deal_record.consent.not_contract', lang: 'ru' },
      }),
    );
  });

  it('a text that is not in the database yet is shown but not editable', async () => {
    renderPage();
    const card = await screen.findByTestId('text-deal_record.consent.platform');
    expect(within(card).getByText(/нужен импорт переводов/)).toBeTruthy();
    expect((within(card).getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('a non-owner sees everything read-only', async () => {
    me = { role: 'support', permissions: { settings: 'view' }, canManageAdmins: false };
    renderPage();
    const first = await screen.findByTestId('switch-deal_record.enabled');
    expect((within(first).getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
  });
});
