import type { NotificationCategory, NotificationType } from '@prisma/client';
import { BadgesService } from './badges.service';
import { DEFAULT_PUSH } from './notification-rules';
import {
  TOPICS,
  TOPIC_BY_KEY,
  TOPIC_FALLBACK,
  TYPE_TOPIC,
  topicOf,
  topicOn,
} from './notification-topics';
import { NOTIFICATION_CATEGORY } from './notifications.service';
import { PushDispatcher } from './push/push-dispatcher';
import type { PushMessage } from './push/push.constants';

/** Owner 2026-10-21 (inbox 30): a switch per kind of notification. */
describe('notification topics', () => {
  const cats = (off: NotificationCategory[] = []) => {
    const set = new Set(off);
    return (c: NotificationCategory) =>
      c === 'system' || (!set.has(c) && DEFAULT_PUSH[c]);
  };

  it('every type has a known switch; every finer switch a fallback', () => {
    for (const t of Object.values(TYPE_TOPIC)) {
      expect(TOPIC_BY_KEY.has(t)).toBe(true);
    }
    for (const d of TOPICS) {
      if (!d.category && !d.locked) expect(TOPIC_FALLBACK[d.key]).toBeTruthy();
    }
  });

  it('Q&A questions are opt-in: off until set, whatever the category says', () => {
    expect(TYPE_TOPIC.legal_question_new).toBe('legalQa');
    expect(topicOn('legalQa', {}, cats())).toBe(false);
    expect(topicOn('legalQa', {}, () => true)).toBe(false);
    expect(topicOn('legalQa', { legalQa: true }, cats())).toBe(true);
    // A reply to my own question stays a personal case update.
    expect(TYPE_TOPIC.legal_answer_update).toBe('caseUpdates');
  });

  it('only the serious system notices are locked', () => {
    const locked = (Object.keys(TYPE_TOPIC) as NotificationType[])
      .filter((t) => TOPIC_BY_KEY.get(TYPE_TOPIC[t])?.locked)
      .sort();
    expect(locked).toEqual(
      [
        'moderation_notice',
        'partner_commission',
        'partner_payout',
        'payout_account_status',
        'security_new_device',
        'security_phone_changed',
        'security_sign_in_changed',
        'subscription_payment_failed',
        'subscription_status',
        'subscription_trial_ending',
      ].sort(),
    );
    // Everything else of the old «System» can be switched off now.
    const freed = (Object.keys(NOTIFICATION_CATEGORY) as NotificationType[])
      .filter((t) => NOTIFICATION_CATEGORY[t] === 'system')
      .filter((t) => !locked.includes(t));
    for (const t of freed) {
      expect(topicOn(TYPE_TOPIC[t], { [TYPE_TOPIC[t]]: false }, cats())).toBe(
        false,
      );
    }
  });

  it('a switch not set yet keeps the old category choice', () => {
    expect(topicOn('likes', {}, cats())).toBe(true);
    expect(topicOn('likes', {}, cats(['social']))).toBe(false);
    expect(topicOn('bidNew', {}, cats(['bids']))).toBe(false);
    // Set: the finer switch wins.
    expect(topicOn('likes', { likes: true }, cats(['social']))).toBe(true);
    expect(topicOn('comments', { likes: false }, cats())).toBe(true);
  });

  it('locked stays on even when stored off', () => {
    expect(topicOn('security', { security: false }, cats())).toBe(true);
  });

  it('the assistants switch silences every kind under it', () => {
    expect(topicOn('assistantTasks', {}, cats())).toBe(true);
    expect(topicOn('assistantTasks', { assistants: false }, cats())).toBe(
      false,
    );
    expect(topicOn('assistantTasks', { assistants: false }, cats(), true)).toBe(
      true,
    );
  });

  it('an assistant request about a case comment is a case', () => {
    expect(topicOf('assistant_request', { kind: 'case_comment' })).toBe(
      'assistantCases',
    );
    expect(topicOf('assistant_request', { kind: 'post' })).toBe(
      'assistantMessages',
    );
  });

  describe('push dispatch', () => {
    function setup(type: NotificationType, topics: Record<string, boolean>) {
      const sent: PushMessage[] = [];
      const prisma = {
        notification: {
          findFirst: () =>
            Promise.resolve({
              id: 'n1',
              type,
              category: NOTIFICATION_CATEGORY[type],
              payload: {},
              read_at: null,
              user_id: 'u1',
              user: {
                ui_language: 'en',
                timezone: null,
                quiet_hours: null,
                status: 'active',
                email: null,
                email_verified_at: null,
              },
            }),
        },
        notificationSetting: {
          findMany: () => Promise.resolve([]),
          findUnique: () => Promise.resolve(null),
        },
        notificationQuietHours: { findUnique: () => Promise.resolve(null) },
        user: {
          findUnique: () =>
            Promise.resolve({ notif_topics: topics, notif_icon_badge: true }),
        },
      };
      const badges = new BadgesService(
        prisma as never,
        {
          hgetall: () => Promise.resolve({ chats: '0', notifs: '1' }),
        } as never,
        {} as never,
      );
      jest.spyOn(badges, 'notificationsChanged').mockResolvedValue();
      const d = new PushDispatcher(
        { mode: 'worker' },
        {} as never,
        prisma as never,
        {
          renderFor: () => Promise.resolve({ title: 'T', body: 'B' }),
        } as never,
        {
          send: (m: PushMessage) => {
            sent.push(m);
            return Promise.resolve();
          },
        },
        {} as never,
        {} as never,
        badges,
        { toUsers: () => undefined } as never,
        { setContext: () => undefined, warn: () => undefined } as never,
      );
      return { d, sent };
    }

    it('a switched-off kind is not pushed', async () => {
      const { d, sent } = setup('post_like', { likes: false });
      expect(
        await d.dispatch({ kind: 'notification', notificationId: 'n1' }, 'j'),
      ).toBe('disabled');
      expect(sent).toHaveLength(0);
    });

    it('another kind of the same old category still is', async () => {
      const { d, sent } = setup('post_comment', { likes: false });
      expect(
        await d.dispatch({ kind: 'notification', notificationId: 'n1' }, 'j'),
      ).toBe('sent');
      expect(sent).toHaveLength(1);
    });

    it('a security notice ignores the switches', async () => {
      const { d, sent } = setup('security_new_device', { security: false });
      expect(
        await d.dispatch({ kind: 'notification', notificationId: 'n1' }, 'j'),
      ).toBe('sent');
      expect(sent).toHaveLength(1);
    });

    it('assistants off: an assistant task is not pushed', async () => {
      const { d } = setup('assistant_task', { assistants: false });
      expect(
        await d.dispatch({ kind: 'notification', notificationId: 'n1' }, 'j'),
      ).toBe('disabled');
    });
  });
});
