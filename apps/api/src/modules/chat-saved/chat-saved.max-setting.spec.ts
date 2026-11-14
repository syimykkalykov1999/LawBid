import { ChatSavedService } from './chat-saved.service';

/** Detective R2B rule 11 (14.11): how many saved messages one person
 * keeps is the admin setting `chat.saved_max` (5000; 0 = no cap). */
function setup(max: number, have: number) {
  const prisma = {
    savedChatMessage: {
      findUnique: jest.fn(() => Promise.resolve(null)),
      count: jest.fn(() => Promise.resolve(have)),
      createMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
  };
  const chat = {
    savableKind: jest.fn(() =>
      Promise.resolve({ kind: 'direct', conversationId: 'c1' }),
    ),
  };
  const settings = {
    number: jest.fn((k: string) =>
      Promise.resolve(k === 'chat.saved_max' ? max : NaN),
    ),
  };
  const svc = new ChatSavedService(
    prisma as never,
    chat as never,
    undefined,
    settings as never,
  );
  return { svc, prisma };
}

describe('saved messages cap from the admin', () => {
  const user = { sub: 'u1' } as never;
  it('refuses at the admin number', async () => {
    const { svc, prisma } = setup(3, 3);
    await expect(svc.save(user, 'm1')).rejects.toMatchObject({
      response: { details: { max: 3 } },
    });
    expect(prisma.savedChatMessage.createMany).not.toHaveBeenCalled();
  });
  it('0 = no cap', async () => {
    const { svc, prisma } = setup(0, 99_999);
    await svc.save(user, 'm1');
    expect(prisma.savedChatMessage.createMany).toHaveBeenCalledTimes(1);
  });
});
