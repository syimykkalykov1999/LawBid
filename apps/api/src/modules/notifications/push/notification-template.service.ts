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
