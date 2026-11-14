import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NotificationType } from '../../generated/prisma/client';
import { DEFAULT_PUSH } from './notification-rules';
import { TOPIC_DEFAULT_OFF, TYPE_TOPIC } from './notification-topics';
import { NOTIFICATION_CATEGORY } from './notifications.service';
import {
  NOTIFICATION_TEMPLATES,
  templateKeys,
} from './push/notification-templates';

/**
 * Owner 2026-10-28 (R-093): «по кейсам не приходят уведомления — проверить
 * все уведомления». One row per case / bid / new-case notification type:
 * it has a push text in every app language, it is pushed by default, and
 * the app knows where a tap on it leads. Before this, 28 case types had a
 * push text only in English and Russian (everyone else got English).
 */
const CASE_CATEGORIES = new Set(['cases', 'bids', 'new_cases']);
const CASE_TYPES = (
  Object.keys(NOTIFICATION_CATEGORY) as NotificationType[]
).filter((t) => CASE_CATEGORIES.has(NOTIFICATION_CATEGORY[t]));

/** The push body is built from other texts (the task kind and its time). */
const BODY_BUILT = new Set<NotificationType>(['task_reminder']);

/** Opt-in on purpose (owner 2026-10-20: «Вопрос юристу» alerts). */
const OPT_IN_TYPES = new Set<NotificationType>(['legal_question_new']);

const SEED_DIR = join(__dirname, '../../../prisma/seed/translations');
const seeds = readdirSync(SEED_DIR)
  .filter((f) => f.endsWith('.json') && f !== '_meta.json')
  .map((f) => ({
    lang: f.replace(/\.json$/, ''),
    texts: JSON.parse(readFileSync(join(SEED_DIR, f), 'utf8')) as Record<
      string,
      string
    >,
  }));

const APP_VIEW = readFileSync(
  join(
    __dirname,
    '../../../../mobile/lib/features/notifications/presentation/notifications_view.dart',
  ),
  'utf8',
);

describe('case notifications, every type (R-093)', () => {
  it('covers the case types and every app language', () => {
    expect(CASE_TYPES.length).toBeGreaterThan(40);
    expect(seeds.length).toBeGreaterThanOrEqual(85);
  });

  it.each(CASE_TYPES)('%s: a push text in every language', (type) => {
    expect(NOTIFICATION_TEMPLATES[type]).toBeDefined();
    const keys = templateKeys(type)!;
    const missing = seeds
      .filter(
        (s) =>
          !s.texts[keys.title]?.trim() ||
          (!BODY_BUILT.has(type) && !s.texts[keys.body]?.trim()),
      )
      .map((s) => s.lang);
    expect(missing).toEqual([]);
  });

  it.each(CASE_TYPES)(
    '%s: pushed to someone who never changed a setting',
    (type) => {
      const on =
        DEFAULT_PUSH[NOTIFICATION_CATEGORY[type]] &&
        !TOPIC_DEFAULT_OFF.has(TYPE_TOPIC[type]);
      expect(on).toBe(!OPT_IN_TYPES.has(type));
    },
  );

  it.each(CASE_TYPES)('%s: the app opens something on tap', (type) => {
    expect(APP_VIEW).toContain(`'${type}'`);
  });
});
