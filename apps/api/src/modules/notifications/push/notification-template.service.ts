import { Injectable } from '@nestjs/common';
import type { NotificationType } from '@prisma/client';
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
  ): Promise<TemplateText> {
    const base = await this.render(type, lang);
    const kind = payload.kind;
    if (type === 'case_workspace_activity' && typeof kind === 'string') {
      return this.workspaceText(base, kind, lang);
    }
    if (
      (type === 'consultation_update' || type === 'legal_answer_update') &&
      typeof kind === 'string'
    ) {
      return this.kindText(base, type, kind, lang);
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

  /** Owner 2026-10-20: booking / Q&A pushes say what happened
   * (`notif.consult.<kind>`, `notif.qa.<kind>`). */
  private async kindText(
    base: TemplateText,
    type: NotificationType,
    kind: string,
    lang: string,
  ): Promise<TemplateText> {
    if (!/^[a-z_]{1,40}$/.test(kind)) return base;
    const scope = type === 'consultation_update' ? 'consult' : 'qa';
    const body = await this.lookup(lang, `notif.${scope}.${kind}`);
    return body ? { title: base.title, body } : base;
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
