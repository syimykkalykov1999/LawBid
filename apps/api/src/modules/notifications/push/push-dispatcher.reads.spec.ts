import { PushDispatcher } from './push-dispatcher';
import type { MessageJobData, PushMessage } from './push.constants';

/**
 * Load test 2026-11-02 (LOAD_RESILIENCE §3): a 1:1 message push no longer
 * reads the recipient's "messages" switch or quiet hours as separate
 * database rows — the quiet hours ride on the user read, the switch comes
 * from the per-user prefs cache of BadgesService (Redis).
 */
function setup(opts: { muted?: boolean; quiet?: boolean } = {}) {
  const sent: PushMessage[] = [];
  const deferred: Date[] = [];
  const reads: string[] = [];
  const spy =
    <T>(name: string, value: T) =>
    () => {
      reads.push(name);
      return Promise.resolve(value);
    };
  // 00:00-23:59 UTC every day: "now" is always inside.
  const quiet = opts.quiet
    ? {
        start_time: new Date('1970-01-01T00:00:00Z'),
        end_time: new Date('1970-01-01T23:59:00Z'),
        timezone: 'UTC',
      }
    : null;
  const prisma = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) => {
        reads.push(`user:${where.id}`);
        return Promise.resolve(
          where.id === 'u1'
            ? { status: 'active', ui_language: 'en', quiet_hours: quiet }
            : { first_name: 'Otto' },
        );
      },
    },
    conversationParticipant: {
      findUnique: spy('participant', {
        muted_until: null,
        last_read_message_id: null,
      }),
    },
    message: {
      findUnique: spy('message', {
        created_at: new Date('2026-10-20T10:00:00Z'),
        body_display: 'hello',
        type: 'text',
        duration_ms: null,
        deleted_at: null,
        revoked_at: null,
        sender_id: 'me',
        sent_by_name: null,
      }),
    },
    chatGroupMember: {
      findUnique: spy('groupMember', { muted_until: null, left_at: null }),
    },
    chatGroupMessage: {
      findFirst: spy('groupMessage', {
        body: 'hi all',
        type: 'text',
        sender_id: 'me',
        deleted_at: null,
        system_kind: null,
        system_payload: null,
        mention_ids: [],
        created_at: new Date('2026-10-20T10:00:00Z'),
        file: null,
        poll: null,
      }),
    },
    chatGroup: {
      findUnique: spy('group', {
        title: 'Team',
        deleted_at: null,
        avatar_file_id: null,
      }),
    },
    notificationSetting: { findUnique: spy('notificationSetting', null) },
    notificationQuietHours: { findUnique: spy('notificationQuietHours', null) },
  };
  const d = new PushDispatcher(
    { mode: 'worker' },
    {} as never,
    prisma as never,
    {
      render: () => Promise.resolve({ title: 'New message', body: 'b' }),
    } as never,
    {
      send: (m: PushMessage) => {
        sent.push(m);
        return Promise.resolve();
      },
    },
    {} as never,
    {
      defer: (_d: unknown, until: Date) => {
        deferred.push(until);
        return Promise.resolve();
      },
    } as never,
    {
      iconFor: () => Promise.resolve({ badge: 1, on: true }),
      mutedCategories: () =>
        Promise.resolve(new Set(opts.muted ? ['messages'] : [])),
      topicSwitches: () =>
        Promise.resolve({ on: () => true, own: () => true, raw: {} }),
    } as never,
    { isViewing: () => Promise.resolve(false) } as never,
    { setContext: () => undefined } as never,
  );
  return { d, sent, deferred, reads };
}

const job: MessageJobData = {
  kind: 'message',
  recipientId: 'u1',
  conversationId: 'c1',
  messageId: 'm1',
};

describe('PushDispatcher 1:1 message reads', () => {
  it('sends without reading the settings or quiet-hours tables', async () => {
    const { d, sent, reads } = setup();
    expect(await d.dispatch(job, 'j')).toBe('sent');
    expect(sent).toHaveLength(1);
    expect(reads).not.toContain('notificationSetting');
    expect(reads).not.toContain('notificationQuietHours');
  });

  it('"Messages" off (from the prefs cache) silences the push', async () => {
    const { d, sent, reads } = setup({ muted: true });
    expect(await d.dispatch(job, 'j')).toBe('disabled');
    expect(sent).toHaveLength(0);
    expect(reads).not.toContain('notificationSetting');
  });

  it('quiet hours that came with the user hold the push back', async () => {
    const { d, sent, deferred, reads } = setup({ quiet: true });
    expect(await d.dispatch(job, 'j')).toBe('deferred');
    expect(sent).toHaveLength(0);
    expect(deferred).toHaveLength(1);
    expect(reads).not.toContain('notificationQuietHours');
  });

  it('a group push takes the quiet hours from the user read too', async () => {
    const { d, sent, deferred, reads } = setup({ quiet: true });
    expect(await d.dispatch({ ...job, groupId: 'g1' }, 'j')).toBe('deferred');
    expect(sent).toHaveLength(0);
    expect(deferred).toHaveLength(1);
    expect(reads).not.toContain('notificationQuietHours');
  });
});
