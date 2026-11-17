import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TYPE_TOPIC } from '../notifications/notification-topics';
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_IMPORTANT,
} from '../notifications/notifications.service';
import {
  NOTIFICATION_TEMPLATES,
  templateKeys,
} from '../notifications/push/notification-templates';
import {
  HOTLINE_NOTICE_TYPE,
  PushHotlineNotifier,
} from './hotline-push-notifier';

/** Owner row 87, plan PR 5: «Адвокат на линии» to a closed app. */
describe('PushHotlineNotifier (plan PR 5)', () => {
  const notice = {
    userId: 'u-1',
    requestId: 'r-1',
    token: 'test-claim-token',
    expiresAt: 1_800_000_060_000,
  };

  function make(quiet: { start: number; end: number } | null) {
    const sent: { to: string[]; event: string; data: unknown }[] = [];
    const emitted: unknown[] = [];
    const notifier = new PushHotlineNotifier(
      {
        toUsers: (to: string[], event: string, data: unknown) =>
          sent.push({ to, event, data }),
      } as never,
      {
        notificationQuietHours: {
          findUnique: () =>
            Promise.resolve(
              quiet && {
                start_time: new Date(Date.UTC(1970, 0, 1, quiet.start, 0)),
                end_time: new Date(Date.UTC(1970, 0, 1, quiet.end, 59)),
                timezone: 'UTC',
              },
            ),
        },
      } as never,
      {
        get: () => ({
          emit: (x: unknown) => {
            emitted.push(x);
            return Promise.resolve({ id: 'n-1' });
          },
        }),
      } as never,
      { setContext: () => undefined, warn: () => undefined } as never,
    );
    return { notifier, sent, emitted };
  }

  it('sends the socket event and stores the push with requestId + claimToken', async () => {
    const { notifier, sent, emitted } = make(null);
    await notifier.lawyerAvailable(notice);
    expect(sent).toEqual([
      {
        to: ['u-1'],
        event: 'hotline:notify',
        data: {
          requestId: 'r-1',
          token: 'test-claim-token',
          expiresAt: notice.expiresAt,
          textKey: 'notif.messages.hotline_attorney_available.title',
        },
      },
    ]);
    expect(emitted).toEqual([
      {
        type: 'hotline_attorney_available',
        recipientId: 'u-1',
        payload: {
          requestId: 'r-1',
          claimToken: 'test-claim-token',
          expiresAt: notice.expiresAt,
        },
      },
    ]);
  });

  it('inside the person’s own quiet hours: the socket event only (a push held till morning would be stale)', async () => {
    const h = new Date().getUTCHours();
    const { notifier, sent, emitted } = make({
      start: (h + 23) % 24,
      end: (h + 1) % 24,
    });
    await notifier.lawyerAvailable(notice);
    expect(sent).toHaveLength(1);
    expect(emitted).toHaveLength(0);
  });

  it('a failing push never breaks the sweep', async () => {
    const notifier = new PushHotlineNotifier(
      { toUsers: () => undefined } as never,
      {
        notificationQuietHours: { findUnique: () => Promise.resolve(null) },
      } as never,
      {
        get: () => ({ emit: () => Promise.reject(new Error('queue down')) }),
      } as never,
      { setContext: () => undefined, warn: () => undefined } as never,
    );
    await expect(notifier.lawyerAvailable(notice)).resolves.toBeUndefined();
  });

  it('the type: «Звонки» switch and category, important, its own push text', () => {
    expect(TYPE_TOPIC[HOTLINE_NOTICE_TYPE]).toBe('calls');
    expect(NOTIFICATION_CATEGORY[HOTLINE_NOTICE_TYPE]).toBe('calls');
    expect(NOTIFICATION_IMPORTANT[HOTLINE_NOTICE_TYPE]).toBe(true);
    expect(NOTIFICATION_TEMPLATES[HOTLINE_NOTICE_TYPE]?.ru.title).toBe(
      'Адвокат на линии',
    );
    expect(templateKeys(HOTLINE_NOTICE_TYPE)).toEqual({
      title: 'notif.messages.hotline_attorney_available.title',
      body: 'notif.messages.hotline_attorney_available.body',
    });
  });

  it('its texts exist in every app language (85)', () => {
    const dir = join(__dirname, '../../../prisma/seed/translations');
    const langs = readdirSync(dir).filter(
      (f) => f.endsWith('.json') && !f.startsWith('_'),
    );
    expect(langs.length).toBe(85);
    const keys = [
      'notif.messages.hotline_attorney_available.title',
      'notif.messages.hotline_attorney_available.body',
      'notif.list.hotline_attorney_available',
    ];
    const empty: string[] = [];
    for (const f of langs) {
      const t = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<
        string,
        string
      >;
      for (const k of keys) if (!t[k]?.trim()) empty.push(`${f}:${k}`);
    }
    expect(empty).toEqual([]);
  });
});
