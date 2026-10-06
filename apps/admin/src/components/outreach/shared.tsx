'use client';

import type { Tone } from '@/components/ui/card';
import { ApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type Lead = components['schemas']['OutreachLeadRowDto'];
export type LeadDetail = components['schemas']['OutreachLeadDetailDto'];
export type LeadStatus = components['schemas']['OutreachLeadStatus'];
export type LeadKind = components['schemas']['OutreachLeadKind'];
export type CallOutcome = components['schemas']['OutreachCallOutcome'];
export type OutreachPartner = components['schemas']['OutreachPartnerDto'];
export type OutreachContext = components['schemas']['OutreachContextDto'];
export type OutreachTemplate = components['schemas']['OutreachTemplateDto'];
export type OutreachSettings = components['schemas']['OutreachSettingsDto'];
export type OutreachStats = components['schemas']['OutreachStatsDto'];
export type ImportReport = components['schemas']['OutreachImportReportDto'];
export type ContactBlockReason = components['schemas']['OutreachContactBlockReason'];
export type Suppressions = components['schemas']['OutreachSuppressionsDto'];

/** Owner 2026-10-05 (legal): why a call / an email is refused right now. */
export const CONTACT_BLOCK: Record<string, string> = {
  dnc: 'лид в списке «не беспокоить»',
  client_disabled: 'работа с клиентами-физлицами выключена',
  hours: 'местное время вне окна звонков',
  unsubscribed: 'отписался от писем',
  email_limit: 'лимит писем одному человеку исчерпан',
  email_cooldown: 'пауза между письмами ещё не прошла',
};

export function contactBlockText(reason: string | null | undefined, callWindow?: string | null): string | null {
  if (!reason) return null;
  const base = CONTACT_BLOCK[reason] ?? reason;
  return reason === 'hours' && callWindow ? `${base} (${callWindow})` : base;
}

export const DO_NOT_CONTACT_REASON: Record<string, string> = {
  manual: 'отмечен вручную',
  not_interested: 'не заинтересован',
  wrong_number: 'неверный номер',
  unsubscribed: 'отписался',
  suppression: 'стоп-лист',
  retention: 'срок хранения',
};

export const LEAD_STATUSES: readonly LeadStatus[] = [
  'new',
  'working',
  'contacted',
  'replied',
  'registered',
  'paid',
  'lost',
];
/** Statuses the system sets by itself (a sign-up with the link, a commission). */
export const SYSTEM_STATUSES: readonly LeadStatus[] = ['registered', 'paid'];
export const CALL_OUTCOMES: readonly CallOutcome[] = [
  'talked',
  'interested',
  'callback',
  'no_answer',
  'voicemail',
  'not_interested',
  'wrong_number',
];

export const LEAD_TONE: Record<string, Tone> = {
  new: 'neutral',
  working: 'info',
  contacted: 'info',
  replied: 'warning',
  registered: 'gold',
  paid: 'success',
  lost: 'danger',
};

export function leadName(l: Pick<Lead, 'firstName' | 'lastName' | 'company' | 'email' | 'phone'>): string {
  const name = [l.firstName, l.lastName].filter(Boolean).join(' ');
  return name || l.company || l.email || formatPhone(l.phone) || 'Без имени';
}

export function partnerName(p: OutreachPartner | null | undefined): string {
  if (!p) return 'не назначен';
  return p.label || p.name || p.code;
}

/** 12125550100 → +1 (212) 555-0100; anything else as is. */
export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return '';
  const m = /^1(\d{3})(\d{3})(\d{4})$/.exec(digits);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : `+${digits}`;
}

/** The i18n import pattern: multipart through the proxy, dry-run first. */
export async function importLeadsCsv(
  file: File,
  q: { mode: 'dry-run' | 'apply'; kind: LeadKind; partnerId?: string; sourceNote: string },
): Promise<ImportReport> {
  const form = new FormData();
  form.append('file', file);
  // Owner 2026-10-05 (legal): where the contacts come from and on what
  // basis they may be contacted — required, stored on every lead.
  const qs = new URLSearchParams({ mode: q.mode, kind: q.kind, sourceNote: q.sourceNote });
  if (q.partnerId) qs.set('partnerId', q.partnerId);
  const res = await fetch(`/api/proxy/outreach/leads/import?${qs}`, { method: 'POST', body: form });
  const body = (await res.json().catch(() => ({}))) as {
    data?: ImportReport;
    error?: { code: string; message: string; details?: Record<string, unknown> };
  };
  if (!res.ok) {
    throw new ApiError(res.status, body.error?.code ?? 'INTERNAL_ERROR', body.error?.message ?? `HTTP ${res.status}`, body.error?.details);
  }
  return body.data!;
}

export async function downloadLeadsCsv(filters: Record<string, string | undefined>): Promise<string> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
  const res = await fetch(`/api/proxy/outreach/leads/export.csv${qs.size ? `?${qs}` : ''}`, { credentials: 'same-origin' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const name = /filename="?([^";]+)"?/i.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'outreach-leads.csv';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return name;
}

/** Local date-time input value ↔ ISO. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}
