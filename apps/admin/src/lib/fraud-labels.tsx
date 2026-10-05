import { Badge, type Tone } from '@/components/ui/card';
import type { components } from '@/lib/api/schema';

/**
 * Owner 2026-10-05 — Russian texts of «Борьба с мошенниками → Клиенты»
 * (apps/api/src/modules/client-fraud): repeat accounts of blocked
 * fraudsters and the client risk score. Never shows a raw hash — only what
 * kind of thing two accounts share.
 */
export type FraudStatus = components['schemas']['FraudStatus'];
export type FraudSignalCode = components['schemas']['FraudSignalCode'];
export type FingerprintKind = components['schemas']['FingerprintKind'];
export type FraudEventKind = components['schemas']['FraudEventKind'];
export type FraudMatchAction = components['schemas']['FraudMatchAction'];
export type FraudQueueFilter = components['schemas']['FraudQueueFilter'];
export type FraudQueueReason = NonNullable<components['schemas']['FraudQueueItemDto']['queueReason']>;
export type FraudUser = components['schemas']['FraudUserDto'];

export const FRAUD_STATUSES: FraudStatus[] = ['review', 'restricted', 'banned', 'ok'];

export const FRAUD_STATUS_RU: Record<FraudStatus, { text: string; tone: Tone }> = {
  ok: { text: 'В порядке', tone: 'success' },
  review: { text: 'На проверке', tone: 'warning' },
  restricted: { text: 'Ограничен', tone: 'danger' },
  banned: { text: 'Заблокирован', tone: 'danger' },
};

export function FraudStatusChip({ status }: { status: string }) {
  const s = FRAUD_STATUS_RU[status as FraudStatus] ?? { text: status, tone: 'neutral' as const };
  return (
    <Badge tone={s.tone} dot>
      {s.text}
    </Badge>
  );
}

export const FRAUD_QUEUE_FILTER_RU: Record<FraudQueueFilter, string> = {
  queue: 'В очереди (проверка и ограниченные)',
  review: 'На проверке',
  restricted: 'Ограничены',
  banned: 'Заблокированы',
  ok: 'В порядке',
  all: 'Все',
};

export const FRAUD_QUEUE_REASON_RU: Record<FraudQueueReason, { text: string; tone: Tone }> = {
  score: { text: 'Балл риска', tone: 'warning' },
  linked: { text: 'Связь с заблокированным', tone: 'danger' },
  staff: { text: 'Решение сотрудника', tone: 'info' },
};

export const FRAUD_SIGNAL_RU: Record<FraudSignalCode, string> = {
  fraud_reports: 'Жалобы адвокатов на мошенничество',
  other_reports: 'Другие жалобы адвокатов',
  contact_issues: 'Подтверждённые фальшивые контакты',
  chargebacks: 'Возвраты платежей через банк (chargeback)',
  cancelled_after_bids: 'Отменённые кейсы после ставок',
  shared_with_blocked: 'Связан с заблокированным аккаунтом',
  weak_shared_with_blocked: 'Общая сеть или текст с заблокированным',
  many_accounts_on_device: 'Несколько аккаунтов на одном телефоне',
  duplicate_text: 'Тот же текст кейса у другого аккаунта',
};

export const FINGERPRINT_KIND_RU: Record<FingerprintKind, string> = {
  phone: 'Телефон',
  email: 'Почта',
  apple: 'Apple ID',
  google: 'Google',
  device: 'Устройство',
  card: 'Карта',
  ip: 'Сеть (IP)',
  text: 'Текст кейса',
};

export function KindChips({ kinds }: { kinds: string[] }) {
  if (!kinds.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {kinds.map((k) => (
        <Badge key={k} tone="neutral">
          {FINGERPRINT_KIND_RU[k as FingerprintKind] ?? k}
        </Badge>
      ))}
    </span>
  );
}

export const FRAUD_EVENT_RU: Record<FraudEventKind, { text: string; tone: Tone }> = {
  linked_match: { text: 'Совпадение с заблокированным', tone: 'warning' },
  sign_in_blocked: { text: 'Отказано во входе', tone: 'danger' },
  auto_review: { text: 'Авто: на проверку', tone: 'warning' },
  auto_restricted: { text: 'Авто: ограничен', tone: 'danger' },
  auto_banned: { text: 'Авто: заблокирован', tone: 'danger' },
  staff_cleared: { text: 'Сотрудник: снято', tone: 'success' },
  staff_restricted: { text: 'Сотрудник: ограничен', tone: 'danger' },
  staff_banned: { text: 'Сотрудник: заблокирован', tone: 'danger' },
  staff_unbanned: { text: 'Сотрудник: разблокирован', tone: 'success' },
  linked_banned: { text: 'Заблокирован вместе со связанным', tone: 'danger' },
};

export function FraudEventChip({ kind }: { kind: string }) {
  const e = FRAUD_EVENT_RU[kind as FraudEventKind] ?? { text: kind, tone: 'neutral' as const };
  return (
    <Badge tone={e.tone} dot>
      {e.text}
    </Badge>
  );
}

export const FRAUD_MATCH_ACTIONS: FraudMatchAction[] = ['block', 'review', 'off'];

export const FRAUD_MATCH_ACTION_RU: Record<FraudMatchAction, string> = {
  block: 'Блокировать сразу',
  review: 'Ограничить и на проверку',
  off: 'Ничего не делать',
};

export const FRAUD_ACTOR_RU: Record<string, string> = {
  system: 'Система',
  admin: 'Сотрудник',
};

/** Name of a person in the fraud lists (the API may return null). */
export function fraudUserName(u: Pick<FraudUser, 'name' | 'id'>): string {
  return u.name?.trim() || `Без имени · ${u.id.slice(0, 8)}`;
}

/** Masked e-mail and phone, joined («—» when neither is known). */
export function maskedContacts(u: Pick<FraudUser, 'email' | 'phone'>): string {
  return [u.email, u.phone].filter(Boolean).join(' · ') || '—';
}
