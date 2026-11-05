import { FilesService } from '../files/files.service';
import { AdminAuthService } from './admin-auth.service';
import type { AdminActor } from './admin-auth.decorators';

/**
 * R-382 (owner 2026-11-04): «фото в аватарку … на аватарке не показывается
 * в вебке». The admin's «me» carries the account's photo (the app avatar)
 * so the panel's top-bar chip shows it instead of the initials.
 */
function build(opts: {
  avatarFileId: string | null;
  files?: Partial<FilesService> | null;
}) {
  const prisma = {
    country: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'boss@x.io',
        avatar_file_id: opts.avatarFileId,
        admin_profile: { admin_role: 'super_admin', permissions: {} },
        admin_credential: null,
      }),
    },
  };
  const moduleRef = {
    get: jest.fn().mockImplementation((token: unknown) => {
      if (token !== FilesService || !opts.files) throw new Error('absent');
      return opts.files;
    }),
  };
  const config = {
    get: () => undefined,
    getOrThrow: () => 50,
  };
  const svc = new AdminAuthService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    config as never,
    undefined,
    undefined,
    undefined,
    moduleRef as never,
  );
  return { svc, prisma, moduleRef };
}

const actor = { id: 'u1', adminRole: 'super_admin' } as AdminActor;

describe('AdminAuthService.me — the admin’s own photo (R-382)', () => {
  it('returns the 256 px avatar link of the account', async () => {
    const avatarUrls = jest.fn().mockResolvedValue({
      url: 'https://media.lawbid.dev/a/full.webp',
      url256: 'https://media.lawbid.dev/a/full_w256.webp',
    });
    const { svc, prisma } = build({
      avatarFileId: 'f1',
      files: { avatarUrls },
    });
    const me = await svc.me(actor);
    expect(me.avatarUrl).toBe('https://media.lawbid.dev/a/full_w256.webp');
    expect(avatarUrls).toHaveBeenCalledWith('f1');
    expect(
      prisma.user.findUniqueOrThrow.mock.calls[0][0].select.avatar_file_id,
    ).toBe(true);
  });

  it('falls back to the full link when there is no preview', async () => {
    const { svc } = build({
      avatarFileId: 'f1',
      files: {
        avatarUrls: jest
          .fn()
          .mockResolvedValue({ url: 'https://m/full.jpg', url256: null }),
      },
    });
    expect((await svc.me(actor)).avatarUrl).toBe('https://m/full.jpg');
  });

  it('no photo set: null, files are not asked', async () => {
    const avatarUrls = jest.fn();
    const { svc } = build({
      avatarFileId: null,
      files: { avatarUrls },
    });
    expect((await svc.me(actor)).avatarUrl).toBeNull();
    expect(avatarUrls).not.toHaveBeenCalled();
  });

  it('a storage error or no files module never breaks «me»', async () => {
    const failing = build({
      avatarFileId: 'f1',
      files: {
        avatarUrls: jest.fn().mockRejectedValue(new Error('s3 down')),
      },
    });
    expect((await failing.svc.me(actor)).avatarUrl).toBeNull();
    const worker = build({ avatarFileId: 'f1', files: null });
    expect((await worker.svc.me(actor)).avatarUrl).toBeNull();
  });
});
