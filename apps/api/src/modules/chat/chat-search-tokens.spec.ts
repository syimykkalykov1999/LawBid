/* eslint-disable @typescript-eslint/require-await -- hand-made fakes */
import type { ConfigService } from '@nestjs/config';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { MessageBodyCipher } from '../../common/secrets/message-body-cipher';
import { MessageSearchIndex } from '../../common/secrets/message-search-index';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RealtimePublisher } from '../realtime/realtime-publisher.service';
import type { StarsService } from '../stars/stars.service';
import { ChatActionsService } from './chat-actions.service';
import { writeSearchTokens } from './chat-search-tokens';
import type { ChatService } from './chat.service';

const env: Record<string, string> = {
  SEARCH_INDEX_KEY: 'Zq8vR2mW5xT9pL4nB7cK1fH6jD3sG0aY',
  MESSAGE_ENC_KEYS: 'm1:a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8',
  MESSAGE_ENC_ACTIVE_KID: 'm1',
};
const config = { get: (k: string) => env[k] } as unknown as ConfigService;
const cipher = new MessageBodyCipher(config);
const settings = {
  boolean: jest.fn(async () => false),
  number: jest.fn(async () => 15),
} as unknown as AppSettingsService;
const index = new MessageSearchIndex(config, cipher, settings);

/** BUG-1 (package N-12b): the write path of the blind search index. */
describe('writeSearchTokens (send path)', () => {
  const m = { id: 'm1', conversation_id: 'c1', type: 'text' };

  it('writes the tokens through the transaction client it is given', async () => {
    const createMany = jest.fn(async () => ({ count: 2 }));
    const tx = { messageSearchToken: { createMany } };
    const n = await writeSearchTokens(
      tx as never,
      index,
      m,
      'Hello, world!',
      false,
    );
    expect(n).toBe(2);
    expect(createMany).toHaveBeenCalledTimes(1);
    const arg = (createMany.mock.calls[0] as unknown[])[0] as {
      data: { conversation_id: string; message_id: string; token: Buffer }[];
      skipDuplicates: boolean;
    };
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data.map((r) => [r.conversation_id, r.message_id])).toEqual([
      ['c1', 'm1'],
      ['c1', 'm1'],
    ]);
    expect(arg.data[0].token.equals(index.tokensFor('hello', false)[0])).toBe(
      true,
    );
  });

  it('writes nothing without the index or for a type without text', async () => {
    const createMany = jest.fn();
    const tx = { messageSearchToken: { createMany } };
    expect(
      await writeSearchTokens(tx as never, undefined, m, 'hi', false),
    ).toBe(0);
    expect(
      await writeSearchTokens(
        tx as never,
        index,
        { ...m, type: 'sticker' },
        'hi',
        false,
      ),
    ).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe('ChatActionsService edit / delete keep the index in step', () => {
  function build() {
    const conv = {
      id: 'c1',
      client_id: 'u1',
      attorney_id: 'a1',
      status: 'active',
      contacts_unlocked: true,
    };
    const msg = {
      id: 'm1',
      conversation_id: 'c1',
      sender_id: 'u1',
      type: 'text',
      revoked_at: null,
      created_at: new Date(),
      body_original: 'old',
    };
    const ops: { op: string; args: unknown }[] = [];
    const op = (name: string) =>
      jest.fn((args: unknown) => {
        const o = { op: name, args };
        return o;
      });
    const prisma = {
      message: {
        findFirst: jest.fn(async () => msg),
        findUnique: jest.fn(async () => null),
        findUniqueOrThrow: jest.fn(async () => msg),
        update: op('message.update'),
      },
      messageEdit: { create: op('messageEdit.create') },
      messagePin: { deleteMany: op('messagePin.deleteMany') },
      messageReaction: { deleteMany: op('messageReaction.deleteMany') },
      messageSearchToken: {
        deleteMany: op('tokens.deleteMany'),
        createMany: op('tokens.createMany'),
      },
      $transaction: jest.fn(async (list: { op: string; args: unknown }[]) => {
        ops.push(...list);
        return list;
      }),
    } as unknown as PrismaService;
    const chat = {
      load: jest.fn(async () => conv),
      mediaLinks: jest.fn(async () => ({})),
      toMessage: jest.fn(() => ({ id: 'm1' })),
    } as unknown as ChatService;
    const svc = new ChatActionsService(
      prisma,
      chat,
      settings,
      { toUsers: jest.fn() } as unknown as RealtimePublisher,
      {} as StarsService,
      cipher,
      undefined,
      index,
    );
    return { svc, ops, prisma };
  }
  const user = { sub: 'u1', role: 'client' } as never;

  it('an edit re-tokenizes in the same transaction, after the row update', async () => {
    const { svc, ops } = build();
    await svc.edit(user, 'c1', 'm1', 'New invoice text');
    const names = ops.map((o) => o.op);
    expect(names).toEqual([
      'messageEdit.create',
      'message.update',
      'tokens.deleteMany',
      'tokens.createMany',
    ]);
    expect(ops[2].args).toEqual({ where: { message_id: 'm1' } });
    const created = ops[3].args as { data: { token: Buffer }[] };
    expect(created.data).toHaveLength(3);
    expect(
      created.data[1].token.equals(index.tokensFor('invoice', false)[0]),
    ).toBe(true);
  });

  it('delete for everyone drops the tokens in the same transaction', async () => {
    const { svc, ops } = build();
    (settings.number as jest.Mock).mockResolvedValueOnce(48);
    await svc.remove(user, 'c1', 'm1', 'all');
    const names = ops.map((o) => o.op);
    expect(names[0]).toBe('message.update');
    expect(names).toContain('tokens.deleteMany');
  });
});
