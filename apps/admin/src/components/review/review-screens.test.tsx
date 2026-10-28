import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewKeyOf, splitDocs } from '@/lib/review-flow';

let search = '';
let switches: Record<string, boolean> = {};
const push = vi.fn();
const GET = vi.fn();
const POST = vi.fn();
const deskPost = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/verification/review',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...(rest as Record<string, unknown>)}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/hooks', () => ({ useMe: () => ({ data: { id: 'me', role: 'verifier', workspacesEnabled: true } }) }));
vi.mock('@/lib/api/client', () => ({
  api: { GET: (...a: unknown[]) => GET(...a), POST: (...a: unknown[]) => POST(...a) },
  ApiError: class extends Error {
    constructor(readonly status: number) {
      super('x');
    }
  },
  toProxy: { onRequest: () => undefined },
  errorText: String,
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/components/reason-dialog', () => ({ useReason: () => ({ ask: async () => ({ text: 'reason text', choice: 'fake_document' }), dialog: null }) }));
vi.mock('@/components/legacy/confirm', () => ({ useConfirm: () => ({ confirm: async () => true, dialog: null }) }));
vi.mock('@/components/trust/trust-panel', () => ({ TrustPanel: () => null }));
vi.mock('@/lib/desk-data', async (orig) => {
  const real = await orig<typeof import('@/lib/desk-data')>();
  return {
    ...real,
    useDeskSettings: () => real.settingsView({ switches, numbers: {} }, false),
    useMyLeases: () => ({ data: undefined, isPending: false }),
    deskPost: (...a: unknown[]) => deskPost(...a),
  };
});

import { ModerationReview } from './moderation-review';
import { resetDocCapForTests, VerificationReview } from './verification-review';

const doc = (id: string, docType: string, side: string | null = null) => ({ id, docType, side, stateCode: null, mime: 'image/jpeg', sizeBytes: 1000, scanStatus: 'clean', notes: null, createdAt: '2026-10-01T00:00:00Z' });
const card = (id: string, first: string) => ({
  id,
  status: 'submitted',
  provider: 'manual',
  submittedAt: '2026-10-27T10:00:00Z',
  reviewedAt: null,
  reviewerId: null,
  attestedAt: null,
  attestationIp: null,
  attestationVersion: null,
  applicantComment: null,
  infoRequestMessage: null,
  rejectionCode: null,
  rejectionReason: null,
  adminNote: null,
  createdAt: '2026-10-27T10:00:00Z',
  attorney: { id: `att-${id}`, username: `u${id}`, firstName: first, lastName: 'Lawyer', verificationStatus: 'pending' },
  licenses: [{ id: `lic-${id}`, stateCode: 'NY', stateName: 'New York', barNumber: '123', status: 'pending', expiresAt: null, expiresSource: null, autoCheckResult: null, registryFlag: null, lookupUrl: null }],
  documents: [doc(`${id}-back`, 'state_id', 'back'), doc(`${id}-front`, 'state_id', 'front'), doc(`${id}-selfie`, 'selfie')],
  checks: [],
  history: [],
});
const CARDS: Record<string, ReturnType<typeof card>> = { r1: card('r1', 'Anna'), r2: card('r2', 'Boris'), r3: card('r3', 'Clara') };

function verificationApi() {
  GET.mockImplementation(async (path: string, init?: { params?: { path?: { id?: string } } }) => {
    if (path === '/admin/verification/requests') return { data: { data: Object.values(CARDS).map((c) => ({ id: c.id, status: c.status, reviewerId: null })) } };
    if (path === '/admin/verification/requests/{id}') return { data: { data: CARDS[init!.params!.path!.id!] } };
    throw new Error(`unexpected GET ${path}`);
  });
  POST.mockImplementation(async (path: string, init?: { params?: { path?: { documentId?: string } } }) => {
    if (path === '/admin/verification/documents/{documentId}/url') {
      return { data: { data: { url: `https://files.example/${init!.params!.path!.documentId}.jpg`, expiresAt: new Date(Date.now() + 300_000).toISOString() } } };
    }
    return { data: { data: {} } };
  });
}

function show(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const calls = (fn: ReturnType<typeof vi.fn>, path: string, id?: string) =>
  fn.mock.calls.filter(([p, init]) => p === path && (!id || JSON.stringify(init).includes(`"${id}"`))).length;

beforeEach(() => {
  search = 'id=r1';
  switches = {};
  push.mockReset();
  GET.mockReset();
  POST.mockReset();
  deskPost.mockReset();
  resetDocCapForTests();
  window.history.replaceState(null, '', '/verification/review?id=r1');
  verificationApi();
});
afterEach(cleanup);

describe('verification review screen', () => {
  it('shows the ID document front then back, the selfie, and opens the next request in place after a decision', async () => {
    show(<VerificationReview />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Anna Lawyer' })).toBeTruthy();
    const pics = await screen.findAllByRole('img');
    expect(pics.map((p) => p.getAttribute('alt'))).toEqual(['ID штата (лицевая)', 'ID штата (оборот)', 'селфи']);

    fireEvent.click(screen.getByRole('button', { name: /Отклонить и дальше/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Boris Lawyer' })).toBeTruthy();
    // a free request is taken first, then rejected — the same calls as the card
    expect(calls(POST, '/admin/verification/requests/{id}/take', 'r1')).toBe(1);
    expect(calls(POST, '/admin/verification/requests/{id}/reject', 'r1')).toBe(1);
    // no navigation: the screen stays, only the address follows the item
    expect(push).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?id=r2');
    expect(screen.getByTestId('review-done-count').textContent).toContain('1');
  });

  it('warms up only the next request, once (card + its pictures)', async () => {
    show(<VerificationReview />);
    await screen.findByRole('heading', { level: 1, name: 'Anna Lawyer' });
    await waitFor(() => expect(calls(POST, '/admin/verification/documents/{documentId}/url', 'r2-selfie')).toBe(1));
    expect(calls(GET, '/admin/verification/requests/{id}', 'r2')).toBe(1);
    expect(calls(POST, '/admin/verification/documents/{documentId}/url', 'r2-front')).toBe(1);
    // never further than one item ahead
    expect(calls(GET, '/admin/verification/requests/{id}', 'r3')).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: /Отклонить и дальше/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Boris Lawyer' })).toBeTruthy();
    // the warmed-up card and links are reused, not asked again
    expect(calls(POST, '/admin/verification/documents/{documentId}/url', 'r2-front')).toBe(1);
  });

  it('approve with A: pending licenses confirmed, request approved, next one shown', async () => {
    show(<VerificationReview />);
    await screen.findByRole('heading', { level: 1, name: 'Anna Lawyer' });
    await act(async () => {
      fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Boris Lawyer' })).toBeTruthy();
    expect(calls(POST, '/admin/verification/requests/{id}/licenses/{licenseId}/decision', 'lic-r1')).toBe(1);
    expect(calls(POST, '/admin/verification/requests/{id}/approve', 'r1')).toBe(1);
  });

  it('N skips without a decision; shortcuts sleep while typing', async () => {
    show(<VerificationReview />);
    await screen.findByRole('heading', { level: 1, name: 'Anna Lawyer' });
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'n', code: 'KeyN' });
    expect(screen.queryByRole('heading', { level: 1, name: 'Boris Lawyer' })).toBeNull();
    input.remove();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'т', code: 'KeyN' });
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Boris Lawyer' })).toBeTruthy();
    expect(calls(POST, '/admin/verification/requests/{id}/reject')).toBe(0);
    expect(calls(POST, '/admin/verification/requests/{id}/approve')).toBe(0);
  });

  it('a picture opens full screen; arrows page, Esc closes', async () => {
    show(<VerificationReview />);
    await screen.findByRole('heading', { level: 1, name: 'Anna Lawyer' });
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть: селфи' }));
    const box = await screen.findByTestId('lightbox');
    expect(box.getAttribute('aria-label')).toBe('селфи');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('lightbox').getAttribute('aria-label')).toBe('ID штата (лицевая)');
    fireEvent.click(screen.getByRole('button', { name: 'Увеличить' }));
    expect(screen.getByText('125%')).toBeTruthy();
    // A inside the lightbox does not approve: the dialog owns the keyboard
    fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });
    expect(calls(POST, '/admin/verification/requests/{id}/approve')).toBe(0);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('lightbox')).toBeNull();
  });

  it('the action buttons sit on one row from 1280 px and show the shortcut hint', async () => {
    show(<VerificationReview />);
    await screen.findByRole('heading', { level: 1, name: 'Anna Lawyer' });
    const row = screen.getByTestId('review-action-row');
    expect(row.className).toContain('xl:flex-nowrap');
    const labels = Array.from(row.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(labels).toEqual(['ПропуститьN', 'Запросить данные и дальше', 'Отклонить и дальшеR', 'Одобрить и дальшеA']);
    for (const b of Array.from(row.querySelectorAll('button'))) expect(b.className).toContain('whitespace-nowrap');
    expect(screen.getByTestId('review-hint').textContent).toContain('Esc');
  });

  it('with the lease engine on: the decision closes the lease and the engine hands the next one', async () => {
    switches = { 'staff.lease_enabled': true, 'staff.lease_verification_enabled': true };
    deskPost.mockImplementation(async (path: string) => {
      if (path === '/admin/desk/lease/next') return { ok: true, data: { status: 'leased', lease: { kind: 'verification', itemId: 'r3', takenAt: '', leasedUntil: '', attempt: 1 } } };
      return { ok: true, data: { ok: true, limited: false } };
    });
    show(<VerificationReview />);
    await screen.findByRole('heading', { level: 1, name: 'Anna Lawyer' });
    fireEvent.click(screen.getByRole('button', { name: /Одобрить и дальше/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Clara Lawyer' })).toBeTruthy();
    expect(deskPost).toHaveBeenCalledWith('/admin/desk/lease/verification/r1/done', { outcome: 'approve' });
    expect(deskPost).toHaveBeenCalledWith('/admin/desk/lease/next', { kind: 'verification' });
  });

  it('with the lease engine on: «Пропустить» asks the reason and uses the engine skip', async () => {
    switches = { 'staff.lease_enabled': true, 'staff.lease_verification_enabled': true };
    deskPost.mockImplementation(async (path: string) => {
      if (path === '/admin/desk/lease/next') return { ok: true, data: { status: 'leased', lease: { kind: 'verification', itemId: 'r2', takenAt: '', leasedUntil: '', attempt: 1 } } };
      return { ok: true, data: { ok: true, limited: false } };
    });
    show(<VerificationReview />);
    await screen.findByRole('heading', { level: 1, name: 'Anna Lawyer' });
    fireEvent.click(screen.getByRole('button', { name: /Пропустить/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Не моя тема' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Boris Lawyer' })).toBeTruthy();
    expect(deskPost).toHaveBeenCalledWith('/admin/desk/lease/verification/r1/skip', { reason: 'not_my_topic' });
  });

  it('opened without an item: takes the first one of the queue', async () => {
    search = '';
    show(<VerificationReview />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Anna Lawyer' })).toBeTruthy();
  });
});

describe('complaints review screen', () => {
  const mod = (id: string, text: string) => ({
    targetType: 'post',
    targetId: id,
    status: 'published',
    text,
    context: {},
    createdAt: '2026-10-27T10:00:00Z',
    author: null,
    reports: [{ id: `rep-${id}`, reason: 'spam', note: 'буэ', reporterId: 'x', status: 'open', createdAt: '2026-10-27T10:00:00Z' }],
    authorHistory: [],
    availableActions: ['hide', 'remove', 'warn', 'dismiss'],
  });
  const MODS: Record<string, ReturnType<typeof mod>> = { p1: mod('p1', 'Первый пост'), p2: mod('p2', 'Второй пост') };

  beforeEach(() => {
    search = 'type=post&id=p1';
    GET.mockImplementation(async (path: string, init?: { params?: { path?: { id?: string } } }) => {
      if (path === '/admin/moderation/queue') return { data: { data: Object.values(MODS).map((m) => ({ targetType: 'post', targetId: m.targetId })) } };
      if (path === '/admin/moderation/targets/{type}/{id}') return { data: { data: MODS[init!.params!.path!.id!] } };
      throw new Error(`unexpected GET ${path}`);
    });
    POST.mockResolvedValue({ data: { data: { reportsHandled: 1 } } });
  });

  it('report → preview → action, then the next object in place; R dismisses', async () => {
    show(<ModerationReview />);
    expect(await screen.findByText('Первый пост')).toBeTruthy();
    expect(screen.getByText('буэ')).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'r', code: 'KeyR' });
    });
    expect(await screen.findByText('Второй пост')).toBeTruthy();
    expect(POST).toHaveBeenCalledWith('/admin/moderation/targets/{type}/{id}/actions', { params: { path: { type: 'post', id: 'p1' } }, body: { action: 'dismiss', reason: 'reason text' } });
    expect(push).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?type=post&id=p2');
  });
});

describe('review rules', () => {
  it('splits ID front/back, selfie and other files', () => {
    const d = splitDocs([doc('b', 'passport', 'back'), doc('s', 'selfie'), doc('l', 'bar_license'), doc('f', 'passport', 'front')]);
    expect(d.id.map((x) => x.id)).toEqual(['f', 'b']);
    expect(d.selfie.map((x) => x.id)).toEqual(['s']);
    expect(d.other.map((x) => x.id)).toEqual(['l']);
  });

  it('shortcuts: layout-free codes, never with modifiers or a dialog open', () => {
    expect(reviewKeyOf({ key: 'ф', code: 'KeyA' }, false)).toBe('approve');
    expect(reviewKeyOf({ key: 'r' }, false)).toBe('reject');
    expect(reviewKeyOf({ key: 'r', ctrlKey: true }, false)).toBeNull();
    expect(reviewKeyOf({ key: 'a' }, true)).toBeNull();
    expect(reviewKeyOf({ key: 'x' }, false)).toBeNull();
  });
});
