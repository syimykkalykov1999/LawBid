import { PrivacySettingsService } from './privacy-settings.service';

/** Owner 2026-10-21: strangers go through «Requests» before calls. */
function make(opts: { chat: boolean; book: boolean }) {
  const prisma = {
    conversation: {
      findFirst: jest.fn(
        (args: { where: { request_status: { in: string[] } } }) => {
          // Only an accepted (or case) chat counts, never a pending one.
          expect(args.where.request_status.in).toEqual(['none', 'accepted']);
          return Promise.resolve(opts.chat ? { id: 'c' } : null);
        },
      ),
    },
    contactMatch: {
      findFirst: jest.fn(() =>
        Promise.resolve(opts.book ? { owner_id: 'a' } : null),
      ),
    },
  };
  return new PrivacySettingsService(prisma as never);
}

describe('PrivacySettingsService.isConnected', () => {
  it('a stranger is not connected', async () => {
    expect(await make({ chat: false, book: false }).isConnected('a', 'b')).toBe(
      false,
    );
  });
  it('an accepted chat connects', async () => {
    expect(await make({ chat: true, book: false }).isConnected('a', 'b')).toBe(
      true,
    );
  });
  it('the phone book connects', async () => {
    expect(await make({ chat: false, book: true }).isConnected('a', 'b')).toBe(
      true,
    );
  });
  it('oneself is always connected', async () => {
    expect(await make({ chat: false, book: false }).isConnected('a', 'a')).toBe(
      true,
    );
  });
});
