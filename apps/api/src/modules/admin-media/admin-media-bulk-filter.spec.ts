import { AdminMediaController } from './admin-media.controller';
import { AdminStickersService } from './admin-stickers.service';
import { AdminVideosService } from './admin-videos.service';

/**
 * Owner 14.11 (row 179 follow-up B6): «Выбрать всё по фильтру» on videos
 * and sticker packs sends the FILTER; the server resolves the ids with
 * the list's where (videos: already deleted ones are left out, as the
 * panel did).
 */
describe('admin media bulk by filter', () => {
  const owner = { id: 'o', ip: null, adminRole: 'super_admin' } as never;
  const staff = { id: 's', ip: null, adminRole: 'moderator' } as never;
  const OWNER_ID = '00000000-0000-4000-8000-000000000002';

  function model(n = 3) {
    return {
      findMany: jest.fn(
        (a: { take?: number; select?: Record<string, unknown> }) =>
          Promise.resolve(
            a.select && Object.keys(a.select).length === 1
              ? Array.from({ length: Math.min(n, a.take ?? n) }, (_, i) => ({
                  id: `m${i}`,
                }))
              : [],
          ),
      ),
    };
  }

  function build() {
    const prisma = { videoAsset: model(), stickerPack: model() };
    const videos = Object.create(
      AdminVideosService.prototype,
    ) as AdminVideosService;
    Object.assign(videos, {
      prisma,
      videos: { present: jest.fn().mockResolvedValue([]) },
    });
    const stickers = Object.create(
      AdminStickersService.prototype,
    ) as AdminStickersService;
    Object.assign(stickers, { prisma });
    const takedown = jest
      .spyOn(videos, 'takedown')
      .mockResolvedValue(undefined);
    const setHidden = jest
      .spyOn(stickers, 'setHidden')
      .mockResolvedValue(undefined as never);
    const record = jest.fn().mockResolvedValue(undefined);
    const settings = { number: jest.fn().mockResolvedValue(2) };
    const ctl = Object.create(
      AdminMediaController.prototype,
    ) as AdminMediaController;
    Object.assign(ctl, { videos, stickers, audit: { record }, settings });
    return { prisma, videos, stickers, ctl, takedown, setHidden, record };
  }

  const whereOf = (m: { findMany: jest.Mock }, idsOnly: boolean) =>
    (
      m.findMany.mock.calls as [
        { where: unknown; select?: Record<string, unknown> },
      ][]
    ).find(
      ([a]) =>
        (a.select ? Object.keys(a.select).length === 1 : false) === idsOnly,
    )![0].where;

  it('videos: the list where, minus already deleted assets', async () => {
    const { prisma, videos } = build();
    const window = {
      from: '2026-11-01T07:00:00.000Z',
      to: '2026-11-08T08:00:00.000Z',
    };
    await videos.list('ready', OWNER_ID, undefined, window);
    await videos.idsByFilter(
      { status: 'ready', ownerId: OWNER_ID, ...window },
      null,
    );
    const list = whereOf(prisma.videoAsset, false) as Record<string, unknown>;
    const ids = whereOf(prisma.videoAsset, true) as Record<string, unknown>;
    expect(ids).toEqual({ ...list, AND: [{ status: { not: 'deleted' } }] });
  });

  it('sticker packs: the list where', async () => {
    const { prisma, stickers } = build();
    const q = { kind: 'user' as const, status: 'active' as const, q: 'cat' };
    await stickers.list(q);
    await stickers.idsByFilter(q, null);
    expect(whereOf(prisma.stickerPack, true)).toEqual(
      whereOf(prisma.stickerPack, false),
    );
  });

  it('take down by filter: staff capped by the setting, audited', async () => {
    const { ctl, takedown, record } = build();
    const out = await ctl.bulkTakedownAdminVideos(staff, {
      filter: { status: 'ready' },
      reason: 'copyright!!',
    } as never);
    expect(out.done).toEqual(['m0', 'm1']);
    expect(takedown).toHaveBeenCalledTimes(2);
    const actions = record.mock.calls.map(
      ([r]: [{ action: string }]) => r.action,
    );
    expect(actions).toEqual([
      'admin.media.bulk_filter',
      'admin.media.bulk_takedown',
    ]);
  });

  it('hide / unhide packs by filter: the owner, every match', async () => {
    const { ctl, setHidden } = build();
    await ctl.bulkHideAdminStickerPacks(owner, {
      filter: { kind: 'user' },
      reason: 'offensive!!',
    } as never);
    expect(setHidden).toHaveBeenCalledTimes(3);
    await ctl.bulkUnhideAdminStickerPacks(owner, {
      filter: { status: 'hidden' },
      reason: 'back again!!',
    } as never);
    expect(setHidden).toHaveBeenCalledTimes(6);
  });

  it('previews', async () => {
    const { ctl } = build();
    await expect(
      ctl.previewAdminVideosBulk(staff, { filter: {} }),
    ).resolves.toEqual({ matched: 2, capped: true, cap: 2 });
    await expect(
      ctl.previewAdminStickerPacksBulk(owner, { filter: {} }),
    ).resolves.toEqual({ matched: 3, capped: false, cap: null });
  });
});
