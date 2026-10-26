import { StickersService } from './stickers.service';

/** R-70: `moderation.image.enabled` is off | on | auto (old booleans too);
 * only `off` stops the paid sticker scan. */
describe('StickersService sticker scan switch', () => {
  function make(raw: Record<string, unknown>) {
    const findUnique = jest.fn().mockResolvedValue(null);
    const settings = {
      raw: jest.fn((k: string) => Promise.resolve(raw[k])),
      boolean: jest.fn((k: string) =>
        Promise.resolve(raw[k] !== false && raw[k] !== 'off'),
      ),
    };
    const svc = new StickersService(
      { mediaModerationCheck: { findUnique } } as never,
      {} as never,
      settings as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const run = (id: string) =>
      (
        svc as unknown as {
          initialModeration(id: string): Promise<string>;
        }
      ).initialModeration(id);
    return { run, findUnique };
  }

  it.each(['off', false])(
    '%s: no scan, sticker is active at once',
    async (v) => {
      const { run, findUnique } = make({
        'stickers.scan_uploads': true,
        'moderation.image.enabled': v,
      });
      expect(await run('f1')).toBe('active');
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it.each(['on', 'auto', true])(
    '%s: scan runs (pending until checked)',
    async (v) => {
      const { run, findUnique } = make({
        'stickers.scan_uploads': true,
        'moderation.image.enabled': v,
      });
      expect(await run('f1')).toBe('pending');
      expect(findUnique).toHaveBeenCalled();
    },
  );
});
