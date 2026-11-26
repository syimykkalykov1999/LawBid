import { E2eeService } from './e2ee.service';
import { pushPreviewKid } from '../../../common/push-previews/push-previews';

/** Third pass M12: a sender gets only the other members' push-preview
 * PUBLIC keys (no tokens, no own devices), none while E2EE is off, and only
 * for a chat it takes part in. */
describe('E2eeService.pushPreviewKeys', () => {
  const keyA = Buffer.alloc(32, 1).toString('base64');
  const keyB = Buffer.alloc(32, 2).toString('base64');

  function build(mode: string) {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { preview_key: keyA },
        { preview_key: keyA },
        { preview_key: 'not-a-key' },
        { preview_key: keyB },
      ]);
    const prisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'c1',
          client_id: 'me',
          attorney_id: 'them',
        }),
      },
      conversationParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      pushToken: { findMany },
    };
    const settings = { get: jest.fn(), string: jest.fn() };
    const service = new E2eeService(
      prisma as never,
      settings as never,
      {} as never,
    );
    jest.spyOn(service, 'mode').mockResolvedValue(mode as never);
    return { service, findMany };
  }

  it('returns the other members’ unique valid keys with their ids', async () => {
    const { service, findMany } = build('on');
    const out = await service.pushPreviewKeys({ sub: 'me' } as never, 'c1');
    expect(out.keys).toEqual([
      { kid: pushPreviewKid(keyA), key: keyA },
      { kid: pushPreviewKid(keyB), key: keyB },
    ]);
    const where = findMany.mock.calls[0][0].where;
    expect(where.user_id).toEqual({ in: ['them'] });
    expect(findMany.mock.calls[0][0].select).toEqual({ preview_key: true });
  });

  it('nothing while end-to-end encryption is off', async () => {
    const { service, findMany } = build('off');
    const out = await service.pushPreviewKeys({ sub: 'me' } as never, 'c1');
    expect(out.keys).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('404 for a chat the caller is not in', async () => {
    const { service } = build('on');
    await expect(
      service.pushPreviewKeys({ sub: 'stranger' } as never, 'c1'),
    ).rejects.toBeDefined();
  });
});
