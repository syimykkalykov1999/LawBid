import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Owner 2026-11-04 (R-394): the request card of an attorney. «Подтвердить»
 * in a license row is never greyed out by the registry; a running registry
 * lookup shows «проверяется…»; the trust block never leaves an empty
 * untitled box above «Лицензии».
 */
let me: { id: string; role: string } = { id: 'me', role: 'super_admin' };
const GET = vi.fn();
const POST = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'req-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/verification/req-1',
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/lib/hooks', () => ({ useMe: () => ({ data: me }) }));
vi.mock('@/lib/api/client', () => ({
  api: { GET: (...a: unknown[]) => GET(...a), POST: (...a: unknown[]) => POST(...a) },
  ApiError: class extends Error {
    constructor(readonly status: number) {
      super('x');
    }
  },
  errorText: String,
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/components/reason-dialog', () => ({ useReason: () => ({ ask: async () => null, dialog: null }) }));
vi.mock('@/components/legacy/confirm', () => ({ useConfirm: () => ({ confirm: async () => true, dialog: null }) }));
vi.mock('@/components/workspace/queue-next', () => ({
  FocusBar: () => null,
  useNextVerification: () => ({ mutate: vi.fn(), isPending: false }),
}));

import VerificationCardPage from './page';
import { TrustPanel } from '@/components/trust/trust-panel';

const license = (over: Record<string, unknown> = {}) => ({
  id: 'lic-1',
  stateCode: 'IL',
  stateName: 'Illinois',
  barNumber: '6248201047',
  status: 'pending',
  expiresAt: null,
  expiresSource: null,
  renewalState: null,
  graceEndsAt: null,
  autoCheckResult: null,
  lookupUrl: null,
  rejectionCode: null,
  rejectionNote: null,
  verifiedAt: null,
  decidedBy: null,
  registryFlag: null,
  registryFlaggedAt: null,
  registryCheck: null,
  ...over,
});
const card = (over: Record<string, unknown> = {}) => ({
  id: 'req-1',
  status: 'in_review',
  provider: 'manual',
  submittedAt: '2026-11-04T07:00:00Z',
  reviewedAt: null,
  reviewerId: 'me',
  attestedAt: null,
  attestationIp: null,
  attestationVersion: null,
  applicantComment: null,
  infoRequestMessage: null,
  rejectionCode: null,
  rejectionReason: null,
  adminNote: null,
  createdAt: '2026-11-04T07:00:00Z',
  attorney: { id: 'att-1', username: 'lawyer', firstName: 'Anna', lastName: 'Lawyer', verificationStatus: 'in_review' },
  licenses: [license()],
  documents: [],
  checks: [],
  history: [],
  ...over,
});

function api(data: ReturnType<typeof card>) {
  GET.mockImplementation(async (path: string) => {
    if (path === '/admin/verification/requests/{id}') return { data: { data } };
    // The trust card stays loading in these tests.
    if (path === '/admin/trust/attorneys/{attorneyId}') return new Promise(() => undefined);
    throw new Error(`unexpected GET ${path}`);
  });
  POST.mockResolvedValue({ data: { data: {} } });
}

function show(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  me = { id: 'me', role: 'super_admin' };
  GET.mockReset();
  POST.mockReset();
});
afterEach(cleanup);

describe('attorney request card (R-394)', () => {
  it('a super-admin confirms a license by hand although the registry never answered', async () => {
    api(card());
    show(<VerificationCardPage />);
    const button = (await screen.findByTestId('license-confirm')) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() =>
      expect(POST).toHaveBeenCalledWith(
        '/admin/verification/requests/{id}/licenses/{licenseId}/decision',
        expect.objectContaining({ params: { path: { id: 'req-1', licenseId: 'lic-1' } }, body: { decision: 'verified' } }),
      ),
    );
  });

  it('a free request is taken first, then the license is confirmed', async () => {
    api(card({ status: 'submitted', reviewerId: null }));
    show(<VerificationCardPage />);
    fireEvent.click(await screen.findByTestId('license-confirm'));
    await waitFor(() => expect(POST.mock.calls.map((c) => c[0])).toEqual([
      '/admin/verification/requests/{id}/take',
      '/admin/verification/requests/{id}/licenses/{licenseId}/decision',
    ]));
  });

  it('when another admin holds the request the button says why it is unavailable', async () => {
    api(card({ reviewerId: 'someone-else' }));
    show(<VerificationCardPage />);
    const button = (await screen.findByTestId('license-confirm')) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('Заявку проверяет другой администратор');
  });

  it('«Одобрить» confirms the undecided licenses first, then approves', async () => {
    api(card());
    show(<VerificationCardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Одобрить' }));
    await waitFor(() => expect(POST.mock.calls.map((c) => c[0])).toEqual([
      '/admin/verification/requests/{id}/licenses/{licenseId}/decision',
      '/admin/verification/requests/{id}/approve',
    ]));
  });

  it('a registry lookup running in the background shows «проверяется…» and locks the lookup buttons', async () => {
    api(card({ licenses: [license({ registryCheck: { checkId: 'c-1', kind: 'recheck', queuedAt: '2026-11-04T07:30:00Z' } })] }));
    show(<VerificationCardPage />);
    expect(await screen.findByTestId('registry-checking')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Перепроверить' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'По реестру' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('«Перепроверить» only queues the lookup', async () => {
    api(card({ licenses: [license({ status: 'verified' })] }));
    POST.mockResolvedValue({ data: { data: { licenseId: 'lic-1', checkId: 'c-1', kind: 'recheck', status: 'queued' } } });
    show(<VerificationCardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Перепроверить' }));
    await waitFor(() =>
      expect(POST).toHaveBeenCalledWith('/admin/verification/licenses/{licenseId}/recheck', { params: { path: { licenseId: 'lic-1' } } }),
    );
  });
});

describe('trust block above «Лицензии» (R-394)', () => {
  it('while loading it is a titled one-line card, not an empty box', async () => {
    GET.mockImplementation(() => new Promise(() => undefined));
    const { container } = show(<TrustPanel attorneyId="att-1" />);
    expect(await screen.findByTestId('trust-panel-placeholder')).toBeTruthy();
    expect(screen.getByText('Борьба с мошенниками')).toBeTruthy();
    expect(container.querySelector('.h-56')).toBeNull();
  });
});
