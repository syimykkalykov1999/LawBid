'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deskGet, deskPost, type DeskResult } from '@/lib/desk-data';

/**
 * Staff package T9: the data of the «Перепроверка» tab (re-check of closed
 * decisions AFTER the fact). Routes live under `admin/workspace/review`;
 * the server answers 404 for everyone who may not re-check (a plain worker,
 * or while the switches are off), and the tab then simply does not exist.
 */
/** The key of the tab in `?tab=` (it belongs to no desk, every desk may show it). */
export const REVIEW_TAB = 'review';

export type ReviewLevel = 'owner' | 'head' | 'senior';

export interface ReviewMe {
  level: ReviewLevel;
  canManage: boolean;
}

export interface ReviewSample {
  id: string;
  decisionKind: string;
  itemId: string;
  stage: string | null;
  outcome: string | null;
  decidedAt: string | null;
  handleSec: number | null;
  facts: { key: string; value: string }[];
  leasedUntil: string;
  /** Owner only. */
  worker: { adminId: string; name: string } | null;
}

export type ReviewNextStatus = 'leased' | 'busy' | 'empty' | 'wrap_up' | 'away' | 'offline' | 'off';

export interface ReviewNext {
  status: ReviewNextStatus;
  sample: ReviewSample | null;
}

export type ReviewVerdict = 'confirmed' | 'overturned' | 'unclear';

export const REVIEW_REASONS: { value: string; label: string }[] = [
  { value: 'wrong_outcome', label: 'Неверный итог' },
  { value: 'missed_signal', label: 'Пропущен важный признак' },
  { value: 'policy_misapplied', label: 'Правило применено неверно' },
  { value: 'wrong_reason_text', label: 'Неверная причина в ответе' },
  { value: 'too_hasty', label: 'Решено слишком поспешно' },
  { value: 'harmful', label: 'Решение причинило вред' },
  { value: 'other', label: 'Другое' },
];

export const REVIEW_KIND_LABEL: Record<string, string> = {
  verification: 'Заявка адвоката',
  support_ticket: 'Обращение в поддержку',
  report: 'Жалоба',
  appeal: 'Обжалование',
  mod_appeal: 'Обжалование',
};

export const FACT_LABEL: Record<string, string> = {
  status: 'Статус',
  submittedAt: 'Подано',
  reviewedAt: 'Рассмотрено',
  rejectionCode: 'Код отказа',
  rejectionReason: 'Причина отказа',
  adminNote: 'Заметка сотрудника',
  subject: 'Тема',
  category: 'Категория',
  createdAt: 'Создано',
  resolvedAt: 'Закрыто',
  targetType: 'Что оспаривается',
  reason: 'Причина жалобы',
  note: 'Комментарий',
  handledAt: 'Обработано',
  message: 'Текст обращения',
  decisionNote: 'Заметка к решению',
  decidedAt: 'Решено',
};

export const NEXT_MESSAGE: Record<Exclude<ReviewNextStatus, 'leased'>, string> = {
  empty: 'Сейчас нечего перепроверять',
  busy: 'У вас уже есть другая работа в руках — закройте её сначала',
  wrap_up: 'Короткая пауза после прошлого дела',
  away: 'Вы отмечены «отошёл»',
  offline: 'Нет связи — проверка недоступна',
  off: 'Раздача работы выключена',
};

const KEY = ['desk-review'] as const;

/** `undefined` while asking, `null` = no tab (not allowed or switched off). */
export function useReviewAccess(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'me'],
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<ReviewMe | null> => {
      try {
        const r = await deskGet<ReviewMe>('/admin/workspace/review/me');
        return r.ok ? r.data : null;
      } catch {
        return null;
      }
    },
  });
}

export function useReviewCurrent(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'current'],
    enabled,
    staleTime: 0,
    queryFn: () => deskGet<{ sample: ReviewSample | null }>('/admin/workspace/review/current'),
  });
}

export function useReviewActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });
  const next = useMutation({
    mutationFn: () => deskPost<ReviewNext>('/admin/workspace/review/next'),
    onSuccess: refresh,
  });
  const verdict = useMutation({
    mutationFn: (v: { id: string; verdict: ReviewVerdict; reasons?: string[] }) =>
      deskPost<{ ok: boolean; result: 'done' | 'returned' }>(`/admin/workspace/review/${v.id}/verdict`, {
        verdict: v.verdict,
        ...(v.reasons && v.reasons.length > 0 ? { reasons: v.reasons } : {}),
      }),
    onSuccess: refresh,
  });
  const release = useMutation({
    mutationFn: (id: string) => deskPost<{ ok: boolean }>(`/admin/workspace/review/${id}/release`),
    onSuccess: refresh,
  });
  return { next, verdict, release };
}

// --- owner / head ---------------------------------------------------------------

export interface ReviewTeamRow {
  adminId: string;
  name: string;
  decisions: number;
  returnedRate: number | null;
  sampled: number;
  overturned: number;
  goldenTotal: number;
  goldenFailed: number;
}

export interface ReviewWorkspaceStats {
  workspace: string;
  decisions: number;
  sampled: number;
  overturned: number;
  overturnRate: number | null;
  returnedRate: number | null;
  goldenTotal: number;
  goldenFailed: number;
  pending: number;
}

export interface ReviewStats {
  snapshotDate: string | null;
  workspaces: ReviewWorkspaceStats[];
  calibration: { decisionKind: string; pairs: number; agreementPct: number | null }[];
}

export interface GoldenRow {
  id: string;
  decisionKind: string;
  state: 'pending' | 'passed' | 'failed';
  worker: { adminId: string; name: string };
  createdAt: string;
  doneAt: string | null;
}

export function useReviewTeam(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'team'],
    enabled,
    staleTime: 60_000,
    queryFn: () => deskGet<{ snapshotDate: string | null; items: ReviewTeamRow[] }>('/admin/workspace/review/team'),
  });
}

export function useReviewStats(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'stats'],
    enabled,
    staleTime: 60_000,
    queryFn: () => deskGet<ReviewStats>('/admin/workspace/review/stats'),
  });
}

export function useGolden(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'golden'],
    enabled,
    staleTime: 30_000,
    queryFn: () => deskGet<{ items: GoldenRow[] }>('/admin/workspace/review/golden'),
  });
}

export function useMarkGolden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sampleId: string): Promise<DeskResult<{ ok: boolean; goldenId: string }>> =>
      deskPost('/admin/workspace/review/golden', { sampleId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'golden'] }),
  });
}

export const percent = (v: number | null): string => (v === null ? '—' : `${v}%`);
