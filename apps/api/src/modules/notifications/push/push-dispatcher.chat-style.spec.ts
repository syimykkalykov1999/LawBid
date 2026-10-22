import { viewerContext } from '../../../common/viewer/viewer-context';
import { PushDispatcher } from './push-dispatcher';
import type { MessageJobData, PushMessage } from './push.constants';

/** Owner 2026-10-22 (WhatsApp): a message push is titled with the sender,
 * says what was sent and carries the sender's photo; a group push is the
 * group on top and «Имя: текст» below. */
const people: Record<string, Record<string, unknown>> = {
  me: { status: 'active', ui_language: 'ru' },
  ann: {
    first_name: 'Ann',
    last_name: 'Lee',
    avatar_file_id: 'f-ann',
    client_profile: null,
    attorney_profile: { username: 'ann' },
  },
  // No name filled in: the @username is shown.
  bob: {
    first_name: null,
    last_name: null,
    avatar_file_id: null,
    client_profile: { username: 'bob_k' },
    attorney_profile: null,
  },
};

function setup(message: Record<string, unknown>, group = false) {
  const sent: PushMessage[] = [];
  const viewers: (string | null)[] = [];
  const prisma = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(people[where.id] ?? null),
    },
    conversationParticipant: {
      findUnique: () =>
        Promise.resolve({ muted_until: null, last_read_message_id: null }),
    },
    message: { findUnique: () => Promise.resolve(message) },
    chatGroupMember: {
      findUnique: () => Promise.resolve({ muted_until: null, left_at: null }),
    },
    chatGroupMessage: { findUnique: () => Promise.resolve(message) },
    chatGroup: {
      findUnique: () =>
        Promise.resolve({
          title: 'Team',
          deleted_at: null,
          avatar_file_id: 'f-team',
        }),
    },
    notificationSetting: { findUnique: () => Promise.resolve(null) },
    notificationQuietHours: { findUnique: () => Promise.resolve(null) },
  };
  const files = {
    avatarUrlsMany: (ids: (string | null)[]) => {
      viewers.push(viewerContext.viewerId());
      return Promise.resolve(
        new Map(
          ids
            .filter((x): x is string => !!x)
            .map((id) => [
              id,
              { url: `https://cdn/${id}`, url256: `https://cdn/256/${id}` },
            ]),
        ),
      );
    },
  };
  const d = new PushDispatcher(
    { mode: 'worker' },
    {} as never,
    prisma as never,
    {
      render: () => Promise.resolve({ title: 'LawBid', body: 'Новое' }),
    } as never,
    {
      send: (m: PushMessage) => {
        sent.push(m);
        return Promise.resolve();
      },
    },
    {} as never,
    {} as never,
    { get: () => Promise.resolve({ total: 1 }) } as never,
    { isViewing: () => Promise.resolve(false) } as never,
    { setContext: () => undefined, warn: () => undefined } as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    files as never,
  );
  const job: MessageJobData = {
    kind: 'message',
    recipientId: 'me',
    conversationId: group ? 'g1' : 'c1',
    messageId: 'm1',
    ...(group ? { groupId: 'g1' } : {}),
  };
  return { d, sent, viewers, job };
}

const base = {
  created_at: new Date(5000),
  body_display: 'привет',
  body: 'привет',
  type: 'text',
  duration_ms: null,
  deleted_at: null,
  revoked_at: null,
  sender_id: 'ann',
  sent_by_name: null,
  file: null,
  mention_ids: [],
  poll: null,
};

describe('PushDispatcher chat pushes like WhatsApp', () => {
  it('1:1: title = sender, body = text, the photo seen as the recipient', async () => {
    const { d, sent, viewers, job } = setup(base);
    expect(await d.dispatch(job, 'j')).toBe('sent');
    const m = sent[0];
    expect(m.title).toBe('Ann Lee');
    expect(m.body).toBe('привет');
    expect(m.chat).toBe(true);
    expect(m.threadId).toBe('c1');
    expect(m.data).toMatchObject({
      type: 'new_message',
      conversationId: 'c1',
      style: 'chat',
      senderId: 'ann',
      senderName: 'Ann Lee',
      senderAvatar: 'https://cdn/256/f-ann',
      senderAvatarKey: 'f-ann',
      text: 'привет',
      kind: 'text',
      sentAt: '5000',
    });
    expect(m.data.isGroup).toBeUndefined();
    // «Who sees my photo» is applied for the recipient.
    expect(viewers).toEqual(['me']);
  });

  it('falls back to the @username and sends no photo without one', async () => {
    const { d, sent, job } = setup({ ...base, sender_id: 'bob' });
    await d.dispatch(job, 'j');
    expect(sent[0].title).toBe('@bob_k');
    expect(sent[0].data.senderAvatar).toBeUndefined();
  });

  it.each([
    ['image/png', '📷 Фото'],
    ['video/mp4', '🎥 Видео'],
    ['application/pdf', '📎 Файл'],
  ])('an attachment %s says «%s»', async (mime, text) => {
    const { d, sent, job } = setup({
      ...base,
      type: 'attachment',
      body_display: '',
      file: { mime },
    });
    await d.dispatch(job, 'j');
    expect(sent[0].body).toBe(text);
  });

  it('a voice note says «Голосовое сообщение» with its length', async () => {
    const { d, sent, job } = setup({
      ...base,
      type: 'voice',
      body_display: '',
      duration_ms: 65_000,
    });
    await d.dispatch(job, 'j');
    expect(sent[0].body).toBe('🎤 Голосовое сообщение 1:05');
    expect(sent[0].data.kind).toBe('voice');
  });

  it('group: title = group, body «Имя: текст», each sender in data', async () => {
    const { d, sent, job } = setup(base, true);
    expect(await d.dispatch(job, 'j')).toBe('sent');
    const m = sent[0];
    expect(m.title).toBe('Team');
    expect(m.body).toBe('Ann Lee: привет');
    expect(m.threadId).toBe('g1');
    expect(m.data).toMatchObject({
      groupId: 'g1',
      isGroup: '1',
      chatTitle: 'Team',
      chatAvatar: 'https://cdn/256/f-team',
      senderName: 'Ann Lee',
      senderAvatar: 'https://cdn/256/f-ann',
      text: 'привет',
    });
  });

  it('group photo from a person without a name: «@username: 📷 Фото»', async () => {
    const { d, sent, job } = setup(
      {
        ...base,
        sender_id: 'bob',
        type: 'attachment',
        body: '',
        file: { mime: 'image/jpeg' },
      },
      true,
    );
    await d.dispatch(job, 'j');
    expect(sent[0].body).toBe('@bob_k: 📷 Фото');
    expect(sent[0].data.text).toBe('📷 Фото');
  });
});
