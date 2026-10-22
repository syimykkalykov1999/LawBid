import type { PinoLogger } from 'nestjs-pino';
import { BadgesService } from '../badges.service';
import { FcmPushSender } from './fcm-push.sender';
import type { PushTokensService } from './push-tokens.service';

/** Owner 2026-10-21 (inbox 29): «Счётчик на иконке в меню» — off, a push
 * puts 0 on the app icon (clears it); on, the unread total. */
describe('app icon badge switch', () => {
  function badges(on: boolean | null) {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue(on === null ? null : { notif_icon_badge: on }),
      },
    };
    const redis = {
      hgetall: jest.fn().mockResolvedValue({ chats: '2', notifs: '3' }),
    };
    return new BadgesService(prisma as never, redis as never, {} as never);
  }

  it('on: the push badge is the unread total', async () => {
    expect(await badges(true).forIcon('u')).toBe(5);
  });

  it('off: the push badge is 0', async () => {
    expect(await badges(false).forIcon('u')).toBe(0);
  });

  it('a missing row counts as on (the default)', async () => {
    expect(await badges(null).forIcon('u')).toBe(5);
  });

  it('GET /badges and badge:update carry the switch', async () => {
    const b = await badges(false).withIcon('u', {
      chatsUnread: 2,
      notificationsUnread: 3,
      total: 5,
    });
    expect(b).toEqual({
      chatsUnread: 2,
      notificationsUnread: 3,
      total: 5,
      iconBadge: false,
    });
  });

  describe('FCM payload', () => {
    const sent: Record<string, any>[] = [];

    function sender() {
      sent.length = 0;
      const tokens = {
        activeTokens: jest.fn().mockResolvedValue(['ios']),
        localReminderTokens: jest.fn().mockResolvedValue([]),
        webTokens: jest.fn().mockResolvedValue([]),
        armedReminders: jest.fn().mockResolvedValue(new Map()),
        remove: jest.fn(),
      } as unknown as PushTokensService;
      const s = new FcmPushSender(
        { projectId: 'p', clientEmail: 'a@b.c', privateKey: 'k' },
        tokens,
        { set: jest.fn().mockResolvedValue('OK'), del: jest.fn() } as never,
        {
          setContext: jest.fn(),
          warn: jest.fn(),
        } as unknown as PinoLogger,
      );
      (s as unknown as { jwt: unknown }).jwt = {
        getAccessToken: () => Promise.resolve({ token: 't' }),
      };
      global.fetch = jest.fn((_url: unknown, init: { body: string }) => {
        sent.push(JSON.parse(init.body).message);
        return Promise.resolve({ ok: true });
      }) as never;
      return s;
    }

    const message = {
      userId: 'u',
      title: 'New message',
      body: 'hi',
      data: { type: 'new_message', conversationId: 'c1' },
      sound: 'message' as const,
    };

    it('with the badge: aps.badge is the number', async () => {
      await sender().send({ ...message, badge: 5 }, 'm:1');
      expect(sent[0].apns.payload.aps.badge).toBe(5);
    });

    it('switch off: aps.badge is 0 and the alert still goes', async () => {
      await sender().send({ ...message, badge: 0 }, 'm:2');
      expect(sent[0].apns.payload.aps.badge).toBe(0);
      expect(sent[0].notification).toEqual({
        title: 'New message',
        body: 'hi',
      });
    });

    it('switch off: Android alert goes through the no-badge channel', async () => {
      await sender().send({ ...message, badge: 0, iconBadge: false }, 'm:4');
      expect(sent[0].android.notification.channel_id).toBe('chats_nobadge');
      await sender().send(
        { ...message, sound: 'notification', badge: 0, iconBadge: false },
        'm:5',
      );
      expect(sent[0].android.notification.channel_id).toBe('general_nobadge');
    });

    it('switch on: the usual channel', async () => {
      await sender().send({ ...message, badge: 5 }, 'm:6');
      expect(sent[0].android.notification.channel_id).toBe('chats');
    });

    it('iconFor: the number and the switch', async () => {
      expect(await badges(false).iconFor('u')).toEqual({ badge: 0, on: false });
      expect(await badges(true).iconFor('u')).toEqual({ badge: 5, on: true });
    });

    it('no badge given: aps has no badge key', async () => {
      await sender().send(message, 'm:3');
      expect('badge' in sent[0].apns.payload.aps).toBe(false);
      // Android never carries a count (the app sets the launcher badge).
      expect(sent[0].android.notification?.notification_count).toBeUndefined();
    });
  });
});
