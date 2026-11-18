import type { PrismaService } from '../../../prisma/prisma.service';
import { PushTokensService } from './push-tokens.service';

/**
 * Verify batch 8 (17.11), PU1: the clean-up of a signed-out device's token
 * deleted by the token alone. A phone handed to another person registers
 * the same token for them (fcm_token is unique, the row moves to the new
 * user); a clean-up for the old owner running at that moment deleted the
 * new owner's fresh row, and their pushes stopped. It now deletes only
 * rows still of the user it checked.
 */
describe('PushTokensService dead-token clean-up (PU1)', () => {
  it('deletes the dead tokens of this user only', async () => {
    const prisma = {
      pushToken: {
        findMany: jest.fn().mockResolvedValue([
          {
            fcm_token: 'tok-dead',
            token_kind: 'fid',
            session_id: null,
            session_chain_id: 'chain-gone',
          },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      session: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PushTokensService(prisma as unknown as PrismaService);
    expect(await service.activeDevices('u-old')).toEqual([]);
    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'u-old', fcm_token: { in: ['tok-dead'] } },
    });
  });
});
