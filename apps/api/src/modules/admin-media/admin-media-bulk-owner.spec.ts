import { BadRequestException } from '@nestjs/common';
import { AdminMediaController } from './admin-media.controller';

/** Owner 2026-11-12: the owner takes down / hides any number at once. */
describe('admin media bulk without a cap for the owner', () => {
  function build() {
    const record = jest.fn().mockResolvedValue(undefined);
    const takedown = jest.fn().mockResolvedValue(undefined);
    const setHidden = jest.fn().mockResolvedValue(undefined);
    const ctl = Object.create(
      AdminMediaController.prototype,
    ) as AdminMediaController;
    Object.assign(ctl, {
      audit: { record },
      videos: { takedown },
      stickers: { setHidden },
    });
    return { ctl, record, takedown, setHidden };
  }
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `v${i}`);

  it('the owner: 700 videos, two chunks, an audit row per chunk', async () => {
    const { ctl, record, takedown } = build();
    const owner = { id: 'o', ip: null, adminRole: 'super_admin' } as never;
    const out = await ctl.bulkTakedownAdminVideos(owner, {
      ids: ids(700),
      reason: 'reason!!',
    });
    expect(out.done).toHaveLength(700);
    expect(takedown).toHaveBeenCalledTimes(700);
    expect(record).toHaveBeenCalledTimes(2);
  });

  it('staff keep 500', async () => {
    const { ctl, setHidden } = build();
    const staff = { id: 's', ip: null, adminRole: 'moderator' } as never;
    await expect(
      ctl.bulkHideAdminStickerPacks(staff, { ids: ids(501), reason: 'r!!' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(setHidden).not.toHaveBeenCalled();
  });
});
