import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const push = vi.fn();
let search = '';
/** R-400: the head of the queue the conveyor reads (one light list call). */
let queueRows: { id: string; status: string; reviewerId: string | null }[] = [];

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'req-1' }),
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
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

import VerificationCardPage, { resetConveyorForTests } from './page';
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
  biometricConsentAt: null,
  biometricConsentVersion: null,
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
    if (path === '/admin/verification/requests') return { data: { data: queueRows } };
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
  search = '';
  queueRows = [];
  push.mockReset();
  GET.mockReset();
  POST.mockReset();
  resetConveyorForTests();
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

describe('face match «Сравнение лица (Amazon)» (row 52)', () => {
  it('shows the similarity against the threshold and the consent', async () => {
    api(
      card({
        biometricConsentAt: '2026-11-12T10:00:00Z',
        biometricConsentVersion: '2026-11-12',
        checks: [
          {
            id: 'c1',
            checkType: 'face_match',
            provider: 'manual',
            result: 'pass',
            details: { provider: 'aws_rekognition', similarity: 98.7, threshold: 90, targetFaces: 1 },
            checkedAt: '2026-11-12T10:01:00Z',
          },
        ],
      } as never),
    );
    show(<VerificationCardPage />);
    const line = await screen.findByTestId('face-match-line');
    expect(line.textContent).toContain('98,7 %');
    expect(line.textContent).toContain('порог 90 %');
    expect(screen.getByText(/текст 2026-11-12/)).toBeTruthy();
  });

  it('a mismatch says why, with no number to misread', async () => {
    api(
      card({
        checks: [
          {
            id: 'c1',
            checkType: 'face_match',
            provider: 'manual',
            result: 'fail',
            details: { provider: 'aws_rekognition', similarity: null, threshold: 90, reason: 'selfie_mismatch' },
            checkedAt: '2026-11-12T10:01:00Z',
          },
        ],
      } as never),
    );
    show(<VerificationCardPage />);
    const line = await screen.findByTestId('face-match-line');
    expect(line.textContent).toContain('ниже порога');
    expect(line.textContent).toContain('лица не совпали');
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

/** Owner 2026-11-04 (R-400): the conveyor — after a decision the next request of the same filter opens here. */
describe('verification conveyor (R-400)', () => {
  const listCalls = () => GET.mock.calls.filter((c) => c[0] === '/admin/verification/requests');
  const cardCalls = (id: string) => GET.mock.calls.filter((c) => c[0] === '/admin/verification/requests/{id}' && JSON.stringify(c[1]).includes(`"${id}"`));

  it('after «Одобрить» the card of the next request in the filter opens, the filter kept in the address', async () => {
    search = 'status=submitted&stateCode=NY';
    queueRows = [
      { id: 'req-1', status: 'submitted', reviewerId: 'me' },
      { id: 'req-9', status: 'submitted', reviewerId: 'someone-else' },
      { id: 'req-2', status: 'submitted', reviewerId: null },
    ];
    api(card());
    show(<VerificationCardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Одобрить' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/verification/req-2?status=submitted&stateCode=NY'));
    // the list was asked once with the filter, the next card warmed up once — never the whole queue
    expect(listCalls()).toHaveLength(1);
    expect(listCalls()[0]![1]).toEqual({ params: { query: { status: 'submitted', stateCode: 'NY', limit: 10 } } });
    await waitFor(() => expect(cardCalls('req-2')).toHaveLength(1));
    expect(cardCalls('req-9')).toHaveLength(0);
  });

  it('«Пропустить» (the «следующая» strip) and the N key move on without a decision', async () => {
    queueRows = [{ id: 'req-1', status: 'in_review', reviewerId: 'me' }, { id: 'req-2', status: 'submitted', reviewerId: null }];
    api(card());
    show(<VerificationCardPage />);
    await screen.findByRole('button', { name: 'Одобрить' });
    fireEvent.keyDown(window, { key: 'n', code: 'KeyN' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/verification/req-2'));
    expect(POST).not.toHaveBeenCalled();
  });

  it('A and R run the approve / reject flows only for a request in my hands, not while typing', async () => {
    api(card());
    show(<VerificationCardPage />);
    await screen.findByRole('button', { name: 'Одобрить' });
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'a', code: 'KeyA' });
    expect(POST).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });
    await waitFor(() => expect(POST.mock.calls.map((c) => c[0])).toContain('/admin/verification/requests/{id}/approve'));
    input.remove();
  });

  it('with the queue empty the card gives way to the empty state instead of going back to the list', async () => {
    queueRows = [{ id: 'req-1', status: 'in_review', reviewerId: 'me' }];
    api(card());
    show(<VerificationCardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Одобрить' }));
    expect(await screen.findByText('Очередь пуста — новых заявок нет.')).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'К списку' }).getAttribute('href')).toBe('/verification');
  });

  it('the copy chips stand under the documents, the registry opens from the licence row in the one registry tab', async () => {
    api(card({ licenses: [license({ lookupUrl: 'https://www.iardc.org/Lawyer/Search' })] }));
    show(<VerificationCardPage />);
    const open = vi.spyOn(window, 'open').mockReturnValue({ focus: vi.fn() } as unknown as Window);
    fireEvent.click(await screen.findByTestId('license-registry-link'));
    expect(open).toHaveBeenCalledWith('https://www.iardc.org/Lawyer/Search', 'lawbid-registry');
    expect(screen.getByTestId('copy-name').title).toBe('Скопировать: Anna Lawyer');
    expect(screen.getByTestId('copy-bar').title).toBe('Скопировать: 6248201047');
    open.mockRestore();
  });
});

/** A loaded trust card («Борьба с мошенниками») for the row-57 checks. */
const trustCard = (over: Record<string, unknown> = {}) => ({
  attorney: { id: 'att-1' },
  level: 2,
  badgeStatus: 'registry_matched',
  badge: true,
  signals: {
    selfAttested: true,
    licenseConfirmed: false,
    licenseConfirmedBy: null,
    documentsVerified: false,
    stripeKyc: false,
    stripeIdentity: false,
    identityConfirmed: false,
    nameCheck: 'match',
    firmLinkConfirmed: false,
  },
  holds: { payments: null, paymentsAt: null, bids: null, bidsAt: null, note: null },
  bidsGate: { ok: true, reason: null, missing: [], current: 2, hold: null },
  paymentsGate: { ok: true, reason: null, missing: [], current: 2, hold: null },
  cleared: true,
  clearedBy: 'staff',
  staffClearedAt: '2026-11-12T22:41:00Z',
  staffClearedBy: { id: 'adm-1', name: 'Vera', email: null, role: 'verifier' },
  staffStatus: 'cleared',
  queueReasons: [],
  missing: [],
  requirements: { registry: true, identity: false, documents: false },
  documentsRequestedAt: null,
  documentsRequestedTemplate: null,
  stripeLegalName: null,
  stripeBusinessType: null,
  stripeCompanyName: null,
  stripeCompanyDomain: null,
  stripeRepresentative: null,
  firmLink: { status: 'none', source: null, emailDomain: null, at: null },
  firmLinkNote: null,
  payoutDelayDays: null,
  complaintsTotal: 0,
  duplicateClaims: 0,
  registryLinks: [{ stateCode: 'IL', url: 'https://www.iardc.org/Lawyer/Search' }],
  lookups: [
    { stateCode: 'IL', stateName: 'Illinois', barNumber: '6248201047', licenseStatus: 'pending', url: 'https://www.iardc.org/Lawyer/Search', prefilled: false, blocked: false },
  ],
  blocked: false,
  latestRequestId: 'req-1',
  events: [
    { id: 'e3', kind: 'staff_cleared', fromLevel: null, toLevel: 2, actorType: 'admin', actorId: 'adm-1', details: { note: null, ip: '10.0.0.1' }, createdAt: '2026-11-12T22:41:00Z' },
    { id: 'e2', kind: 'staff_cleared', fromLevel: 1, toLevel: null, actorType: 'admin', actorId: null, details: { note: 'checked the bar page' }, createdAt: '2026-11-12T22:40:00Z' },
    { id: 'e1', kind: 'staff_cleared', fromLevel: 0, toLevel: 1, actorType: 'admin', actorId: 'adm-1', details: {}, createdAt: '2026-11-10T09:00:00Z' },
  ],
  ...over,
});

function apiWithTrust(data: ReturnType<typeof card>, trust: ReturnType<typeof trustCard> = trustCard()) {
  api(data);
  const base = GET.getMockImplementation()!;
  GET.mockImplementation(async (path: string, init: unknown) => {
    if (path === '/admin/trust/attorneys/{attorneyId}') return { data: { data: trust } };
    return base(path, init);
  });
}

/** Every clickable label on the page: buttons and the opened «Ещё» menu's items. */
const labels = () => screen.queryAllByRole('button').concat(screen.queryAllByRole('menuitem')).map((b) => b.textContent?.trim() ?? '');
const times = (text: string) => labels().filter((l) => l === text).length;

/** Owner 2026-11-12 (row 57): «в одной проверке 2 проверки» — each thing once. */
describe('request card without repeats (row 57)', () => {
  it('one decision area: every action exactly once, the rare ones in «Ещё», none left in the trust panel', async () => {
    // no licence rows here: their own per-licence «Подтвердить» / «Отклонить» are checked above
    apiWithTrust(card({ licenses: [] }));
    show(<VerificationCardPage />);
    await screen.findByTestId('trust-panel');
    expect(screen.queryByTestId('trust-actions')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ещё действия' }));
    await screen.findAllByRole('menuitem');
    for (const action of [
      'Запросить информацию',
      'Отклонить',
      'Одобрить',
      'Приостановить адвоката',
      'Снять подтверждение адвоката',
      'Запросить документы',
      'Отклонить адвоката',
      'Пересчитать',
      'Подтвердить лицензию',
      'Подтвердить связь с фирмой',
      'Поставить холд',
      'Снять холд',
    ]) {
      expect(times(action), action).toBe(1);
    }
    // the request's own actions are buttons, the trust ones live in the menu
    const area = screen.getByTestId('decision-area');
    expect(within(area).getByRole('button', { name: 'Одобрить' })).toBeTruthy();
    expect(within(area).getByRole('menuitem', { name: 'Поставить холд' })).toBeTruthy();
  });

  it('a trust action from «Ещё» calls the trust API', async () => {
    apiWithTrust(card());
    show(<VerificationCardPage />);
    await screen.findByTestId('trust-panel');
    fireEvent.click(screen.getByRole('button', { name: 'Ещё действия' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Пересчитать' }));
    await waitFor(() =>
      expect(POST).toHaveBeenCalledWith('/admin/trust/attorneys/{attorneyId}/recompute', { params: { path: { attorneyId: 'att-1' } } }),
    );
  });

  it('documents are drawn once: one thumbnail each with its details and «Открыть», no second list', async () => {
    const doc = (id: string, docType: string, over: Record<string, unknown> = {}) => ({
      id,
      docType,
      side: null,
      stateCode: null,
      mime: 'application/zip',
      sizeBytes: 20480,
      scanStatus: 'clean',
      createdAt: '2026-11-12T10:00:00Z',
      notes: null,
      capture: null,
      ...over,
    });
    apiWithTrust(card({ documents: [doc('d1', 'bar_license', { notes: 'front page', stateCode: 'IL' }), doc('d2', 'selfie')] } as never));
    show(<VerificationCardPage />);
    const thumbs = await screen.findAllByTestId('document-thumb');
    expect(thumbs).toHaveLength(2);
    expect(screen.getAllByTestId('document-meta')).toHaveLength(2);
    expect(times('Открыть')).toBe(2);
    expect(screen.getAllByText('лицензия адвоката')).toHaveLength(1);
    expect(screen.getAllByText('Комментарий адвоката: front page')).toHaveLength(1);
    expect(within(thumbs[0]!).getByText(/IL · application\/zip · 20 KB/)).toBeTruthy();
  });

  it('the registry link is there once per licence: not under the documents, not in the trust panel', async () => {
    apiWithTrust(card({ licenses: [license({ lookupUrl: 'https://www.iardc.org/Lawyer/Search' })] }));
    show(<VerificationCardPage />);
    await screen.findByTestId('trust-panel');
    expect(screen.getAllByTestId('license-registry-link')).toHaveLength(1);
    expect(screen.queryByTestId('registry-open')).toBeNull();
    expect(screen.queryByText('Открыть в реестре')).toBeNull();
  });

  it('«Подтверждён» is said once; one action recorded twice a minute apart is one event with both details', async () => {
    apiWithTrust(card());
    show(<VerificationCardPage />);
    const status = await screen.findByTestId('trust-status');
    expect(within(status).getAllByText('Подтверждён')).toHaveLength(1);
    expect(status.textContent).toContain('Vera');
    const events = within(screen.getByTestId('trust-events')).getAllByRole('listitem');
    expect(events).toHaveLength(2);
    expect(events[0]!.textContent).toContain('checked the bar page');
    expect(events[0]!.textContent).toContain('IP 10.0.0.1');
    expect(events[0]!.textContent).toContain('1 → 2');
  });

  it('on its own page (no request card) the trust panel keeps its buttons and registry lookups', async () => {
    apiWithTrust(card());
    show(<TrustPanel attorneyId="att-1" />);
    const grid = await screen.findByTestId('trust-actions');
    expect(within(grid).getByRole('button', { name: 'Снять подтверждение' })).toBeTruthy();
    expect(within(grid).getByRole('button', { name: 'Поставить холд' })).toBeTruthy();
    expect(screen.getByText('Открыть в реестре')).toBeTruthy();
  });
});
