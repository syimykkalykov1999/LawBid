import { Injectable } from '@nestjs/common';
import type { NotificationType } from '@prisma/client';
import { localIsoDate, safeTimeZone } from '../../../common/utils/zoned-time';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  GENERIC_TEMPLATE,
  NOTIFICATION_TEMPLATES,
  templateKeys,
  type TemplateText,
} from './notification-templates';

const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Server-side localization of notification texts by `users.ui_language`
 * (docs/05 §9.5): i18n_translations (admin-editable, docs/02 §4.B) first,
 * then the built-in en/ru default, then English. Per-process cache of
 * (lang, key) → value so a push burst costs no extra DB reads.
 */
@Injectable()
export class NotificationTemplateService {
  private readonly cache = new Map<string, { v: string | null; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async render(type: NotificationType, lang: string): Promise<TemplateText> {
    const keys = templateKeys(type);
    const defaults = NOTIFICATION_TEMPLATES[type] ?? GENERIC_TEMPLATE;
    const fallback = lang === 'ru' ? defaults.ru : defaults.en;
    if (!keys) return fallback;
    const [title, body] = await Promise.all([
      this.lookup(lang, keys.title),
      this.lookup(lang, keys.body),
    ]);
    return { title: title ?? fallback.title, body: body ?? fallback.body };
  }

  /**
   * Owner 2026-10-07 (phone test): the push says what actually happened.
   * A `verification_update` with a `kind` uses the app's own
   * `notif.verification.<kind>` text (translated in the admin) as its
   * body; the generic «Статус верификации изменился» only when none.
   */
  async renderFor(
    type: NotificationType,
    payload: Record<string, unknown>,
    lang: string,
    timeZone = 'UTC',
  ): Promise<TemplateText> {
    const base = await this.render(type, lang);
    if (type === 'task_reminder') {
      return this.taskReminderText(base, payload, lang, timeZone);
    }
    const kind = payload.kind;
    if (type === 'case_workspace_activity' && typeof kind === 'string') {
      return this.workspaceText(base, kind, lang);
    }
    if (type !== 'verification_update' || typeof kind !== 'string') {
      return base;
    }
    if (!/^[a-z_]{1,40}$/.test(kind)) return base;
    const key = `notif.verification.${kind}`;
    const body =
      (await this.lookup(lang, key)) ??
      VERIFICATION_KIND_FALLBACK[kind]?.[lang === 'ru' ? 'ru' : 'en'] ??
      null;
    if (!body) return base;
    // The app's texts name the license by {state} / {date}.
    const str = (k: string) => {
      const v = payload[k];
      return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
    };
    return {
      title: base.title,
      body: body
        .replace(/\{state\}/g, str('stateCode'))
        .replace(/\{date\}/g, str('expiresAt')),
    };
  }

  /**
   * Owner 2026-10-20: the planner push says what and when — the kind of
   * task and its time on the person's own clock («Meeting · 14:30») — and
   * never the task's title (docs/05 §9.5). A reminder that could not be
   * sent in time says so in its title («Missed reminder»), with the date.
   */
  private async taskReminderText(
    base: TemplateText,
    payload: Record<string, unknown>,
    lang: string,
    timeZone: string,
  ): Promise<TemplateText> {
    const missed = payload.missed === true;
    const kind = typeof payload.kind === 'string' ? payload.kind : 'other';
    const label = /^[a-z_]{1,40}$/.test(kind)
      ? ((await this.lookup(lang, `tasks.kind.${kind}`)) ??
        TASK_KIND_FALLBACK[kind]?.[lang === 'ru' ? 'ru' : 'en'] ??
        null)
      : null;
    const title = missed
      ? ((await this.lookup(lang, TASK_MISSED_KEY)) ??
        TASK_MISSED_FALLBACK[lang === 'ru' ? 'ru' : 'en'])
      : base.title;
    const when = taskReminderWhen(payload, lang, timeZone, missed);
    const body = [label, when].filter((x): x is string => !!x).join(' · ');
    return { title, body: body || base.body };
  }

  /** Audit 2026-10-19: «Новое в кейсе» + what was added. */
  private async workspaceText(
    base: TemplateText,
    kind: string,
    lang: string,
  ): Promise<TemplateText> {
    const fallback = WORKSPACE_KIND_FALLBACK[kind];
    if (!fallback) return base;
    const body =
      (await this.lookup(lang, `notif.workspace.${kind}`)) ??
      fallback[lang === 'ru' ? 'ru' : 'en'];
    return { title: base.title, body };
  }

  private async lookup(lang: string, key: string): Promise<string | null> {
    const cacheKey = `${lang}:${key}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.v;
    const row = await this.prisma.i18nTranslation.findFirst({
      where: { lang, i18n_key: { key } },
      select: { value: true },
    });
    const v = row?.value ?? null;
    this.cache.set(cacheKey, { v, at: Date.now() });
    return v;
  }
}

/** Owner 2026-10-20: title of a reminder that went out late. */
export const TASK_MISSED_KEY = 'notif.cases.task_reminder.missed';
const TASK_MISSED_FALLBACK = {
  en: 'Missed reminder',
  ru: 'Пропущено напоминание о задаче',
};

/** Built-in kind names for when the translations are not imported yet. */
const TASK_KIND_FALLBACK: Record<string, { en: string; ru: string }> = {
  call: { en: 'Call', ru: 'Позвонить' },
  meeting: { en: 'Meeting', ru: 'Встреча' },
  court: { en: 'Court', ru: 'Суд' },
  deadline: { en: 'Deadline', ru: 'Срок' },
  documents: { en: 'Documents', ru: 'Документы' },
  print: { en: 'Print', ru: 'Распечатать' },
  visit: { en: 'Visit', ru: 'Съездить' },
  other: { en: 'Task', ru: 'Задача' },
  consultation: { en: 'Consultation', ru: 'Консультация' },
  hearing_prep: { en: 'Hearing prep', ru: 'Подготовка к суду' },
  deposition: { en: 'Deposition', ru: 'Показания' },
  mediation: { en: 'Mediation', ru: 'Медиация' },
  filing: { en: 'File with court', ru: 'Подать в суд' },
  review: { en: 'Review', ru: 'Изучить' },
  email: { en: 'Email / letter', ru: 'Письмо' },
  sign: { en: 'Sign', ru: 'Подписать' },
  payment: { en: 'Payment', ru: 'Оплата' },
  research: { en: 'Research', ru: 'Исследование' },
  jail_visit: { en: 'Facility visit', ru: 'Визит в учреждение' },
};

/**
 * The time of a task reminder on the person's clock, in their language's
 * own style (14:30 / 2:30 PM). A missed one, or a task on another day than
 * the reminder, also carries the date.
 */
export function taskReminderWhen(
  payload: Record<string, unknown>,
  lang: string,
  timeZone: string,
  withDate: boolean,
): string | null {
  const raw = payload.dueAt ?? payload.remindAt;
  const at = typeof raw === 'string' ? new Date(raw) : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  const remind =
    typeof payload.remindAt === 'string' ? new Date(payload.remindAt) : at;
  const sameDay =
    !Number.isNaN(remind.getTime()) &&
    localIsoDate(at, safeTimeZone(timeZone)) ===
      localIsoDate(remind, safeTimeZone(timeZone));
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: safeTimeZone(timeZone),
    hour: 'numeric',
    minute: '2-digit',
    ...(withDate || !sameDay ? { month: 'short', day: 'numeric' } : {}),
  };
  try {
    return new Intl.DateTimeFormat(lang, opts).format(at);
  } catch {
    return new Intl.DateTimeFormat('en', opts).format(at);
  }
}

/** Audit 2026-10-19: what the other side added in a case in work. */
const WORKSPACE_KIND_FALLBACK: Record<string, { en: string; ru: string }> = {
  update: {
    en: 'A new update in the case.',
    ru: 'В кейсе новое обновление.',
  },
  task_added: {
    en: 'A new task in the case.',
    ru: 'В кейсе новая задача.',
  },
  task_done: {
    en: 'A task in the case is done.',
    ru: 'Задача в кейсе выполнена.',
  },
  task_files: {
    en: 'A note or files were added to a task.',
    ru: 'К задаче добавили заметку или файлы.',
  },
  invoice: {
    en: 'The attorney sent an invoice for the case.',
    ru: 'Адвокат прислал счёт по кейсу.',
  },
  sign_request: {
    en: 'A document in the case is waiting for your signature.',
    ru: 'Документ в кейсе ждёт вашей подписи.',
  },
  sign_done: {
    en: 'A document in the case is signed by both sides.',
    ru: 'Документ в кейсе подписан обеими сторонами.',
  },
  sign_declined: {
    en: 'A document in the case was declined.',
    ru: 'От подписи документа в кейсе отказались.',
  },
  details: {
    en: 'The client changed the case details.',
    ru: 'Клиент изменил подробности кейса.',
  },
};

/** Built-in texts for kinds whose translations are not imported yet. */
const VERIFICATION_KIND_FALLBACK: Record<string, { en: string; ru: string }> = {
  self_attested: {
    en: 'License accepted under oath. The blue check appears once the state registry or LawBid confirms it.',
    ru: 'Лицензия принята под присягой. Синяя галочка появится, когда её подтвердит реестр штата или LawBid.',
  },
  approved: {
    en: 'License confirmed. Choose your practice areas to see cases.',
    ru: 'Лицензия подтверждена. Выберите практики, чтобы видеть кейсы.',
  },
  rejected: {
    en: 'Verification request rejected. See the reason on the status screen.',
    ru: 'Заявка на верификацию отклонена. Причину смотрите на экране статуса.',
  },
  in_review: {
    en: 'Your verification request is being reviewed.',
    ru: 'Ваша заявка на верификацию на проверке.',
  },
};
