import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { GroupPresenter } from './group-presenter.service';
import { GroupsService } from './groups.service';

/**
 * Groups WhatsApp parity (voice): a voice note in a group is sent like a
 * 1:1 one (ChatService.send, type voice) — a clean `chat_voice` file of the
 * sender, its length and bars, never a file already sent elsewhere, and it
 * is media for the «who can send media» rule.
 */
function setup(opts: { media?: 'all' | 'admins'; used?: boolean } = {}) {
  const created = {
    id: 'm1',
    group_id: 'g1',
    created_at: new Date(1000),
  };
  const tx = {
    chatGroupMessage: { create: jest.fn().mockResolvedValue(created) },
    chatGroup: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    chatGroupMessage: {
      findFirst: jest.fn().mockResolvedValue(opts.used ? { id: 'x' } : null),
    },
    message: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const files = { assertAttachable: jest.fn().mockResolvedValue(undefined) };
  const svc = new GroupsService(
    prisma as never,
    files as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  jest.spyOn(svc, 'assertEnabled').mockResolvedValue(undefined);
  jest.spyOn(svc, 'requireMember').mockResolvedValue({
    admin: false,
    group: {
      who_can_post: 'all',
      who_can_media: opts.media ?? 'all',
      disappear_after_s: null,
    },
  } as never);
  jest
    .spyOn(svc as unknown as { findOwn(): Promise<null> }, 'findOwn')
    .mockResolvedValue(null);
  jest.spyOn(svc, 'writableTopic').mockResolvedValue(null);
  jest
    .spyOn(svc, 'takeSlowModeSlot')
    .mockResolvedValue(() => Promise.resolve());
  const fanOut = jest.spyOn(svc, 'fanOut').mockResolvedValue(undefined);
  jest
    .spyOn(svc as unknown as { one(): Promise<unknown> }, 'one')
    .mockResolvedValue({ id: 'm1', type: 'voice' });
  return { svc, tx, prisma, files, fanOut };
}

const USER = { sub: 'u1' } as never;
const VOICE = {
  clientMessageId: 'cmid-voice-1',
  type: 'voice',
  fileId: '00000000-0000-4000-8000-000000000001',
  durationMs: 4200,
  waveform: [0, 40, 100, 20],
  body: 'ignored for a voice note',
} as never;

describe('GroupsService.send — voice notes', () => {
  it('stores type voice with the chat_voice file, length and bars, no text', async () => {
    const { svc, tx, files, fanOut } = setup();
    await svc.send(USER, 'g1', VOICE);
    expect(files.assertAttachable).toHaveBeenCalledWith(
      'u1',
      '00000000-0000-4000-8000-000000000001',
      ['chat_voice'],
    );
    expect(tx.chatGroupMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'voice',
        body: '',
        file_id: '00000000-0000-4000-8000-000000000001',
        file_name: null,
        duration_ms: 4200,
        waveform: [0, 40, 100, 20],
      }),
    });
    expect(fanOut).toHaveBeenCalled();
  });

  it('needs fileId and durationMs', async () => {
    const { svc, tx } = setup();
    await expect(
      svc.send(USER, 'g1', {
        clientMessageId: 'cmid-voice-2',
        type: 'voice',
        fileId: '00000000-0000-4000-8000-000000000001',
      } as never),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.VALIDATION_ERROR },
    });
    expect(tx.chatGroupMessage.create).not.toHaveBeenCalled();
  });

  it('a file already sent (group or 1:1) is refused', async () => {
    const { svc, tx } = setup({ used: true });
    await expect(svc.send(USER, 'g1', VOICE)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.chatGroupMessage.create).not.toHaveBeenCalled();
  });

  it('is media: refused where only admins send media', async () => {
    const { svc, files } = setup({ media: 'admins' });
    await expect(svc.send(USER, 'g1', VOICE)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(files.assertAttachable).not.toHaveBeenCalled();
  });

  it('an attachment still checks a chat_attachment file', async () => {
    const { svc, files, tx } = setup();
    await svc.send(USER, 'g1', {
      clientMessageId: 'cmid-file-1',
      type: 'attachment',
      fileId: '00000000-0000-4000-8000-000000000002',
      fileName: 'a.pdf',
    } as never);
    expect(files.assertAttachable).toHaveBeenCalledWith(
      'u1',
      '00000000-0000-4000-8000-000000000002',
      ['chat_attachment'],
    );
    const data = (
      tx.chatGroupMessage.create.mock.calls[0] as [{ data: object }]
    )[0].data;
    expect(data).toMatchObject({ type: 'attachment', file_name: 'a.pdf' });
    expect(data).not.toHaveProperty('duration_ms');
  });
});

describe('GroupPresenter — voice notes', () => {
  function presenter() {
    const files = {
      avatarUrlsMany: jest.fn().mockResolvedValue(new Map()),
      attachmentUrls: jest.fn().mockResolvedValue(new Map()),
      voiceUrls: jest
        .fn()
        .mockResolvedValue(new Map([['f-voice', 'https://signed/voice']])),
    };
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      chatGroupMessageReaction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return {
      files,
      p: new GroupPresenter(prisma as never, files as never, {} as never),
    };
  }
  const row = {
    id: 'm1',
    group_id: 'g1',
    sender_id: 'u2',
    type: 'voice',
    body: '',
    client_message_id: 'c1',
    system_kind: null,
    system_payload: null,
    topic_id: null,
    reply_to_id: null,
    mention_ids: [],
    file_id: 'f-voice',
    file_name: null,
    duration_ms: 4200,
    waveform: [1, 50, 99],
    edited_at: null,
    deleted_at: null,
    expires_at: null,
    forwarded: false,
    forwarded_from_name: null,
    created_at: new Date(1000),
    shard_id: 0,
  };

  it('a note carries its signed link (files.voiceUrls), length and bars', async () => {
    const { p, files } = presenter();
    const [dto] = await p.messages([row] as never, 'u1');
    expect(files.voiceUrls).toHaveBeenCalledWith(['f-voice']);
    expect(files.attachmentUrls).toHaveBeenCalledWith([]);
    expect(dto.type).toBe('voice');
    expect(dto.attachment).toBeNull();
    expect(dto.voice).toEqual({
      url: 'https://signed/voice',
      durationMs: 4200,
      waveform: [1, 50, 99],
      listened: false,
    });
  });

  it('a deleted note has no audio and a text message no voice', async () => {
    const { p, files } = presenter();
    const [gone, text] = await p.messages(
      [
        { ...row, deleted_at: new Date(2000) },
        { ...row, id: 'm2', type: 'text', body: 'hi', file_id: null },
      ] as never,
      'u1',
    );
    expect(files.voiceUrls).toHaveBeenCalledWith([]);
    expect(gone.voice).toBeNull();
    expect(text.voice).toBeNull();
  });
});
