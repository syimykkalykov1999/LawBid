import { ConflictException } from '@nestjs/common';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { TasksService } from './tasks.service';

/** Owner 2026-10-07 (bugs 14, 17): files on one task — the «Задачи» row
 * of «Загрузки и файлы». */
describe('TasksService file limit', () => {
  const make = (stored: unknown) => {
    const settings = { raw: jest.fn().mockResolvedValue(stored) };
    const service = new TasksService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      settings as unknown as AppSettingsService,
    );
    return (count: number, had?: number) =>
      (
        service as unknown as {
          assertFileCount(c: number, h?: number): Promise<void>;
        }
      ).assertFileCount(count, had);
  };

  it('allows up to the default 10', async () => {
    await expect(make(undefined)(10)).resolves.toBeUndefined();
  });

  it('refuses one more with FILES_COUNT_LIMIT and the max', async () => {
    const err = await make(undefined)(11).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      code: ErrorCode.FILES_COUNT_LIMIT,
      details: { place: 'task', max: 10 },
    });
  });

  it('follows the admin value', async () => {
    const check = make({ task: { maxFiles: 3 } });
    await expect(check(3)).resolves.toBeUndefined();
    await expect(check(4)).rejects.toBeInstanceOf(ConflictException);
  });

  it('an older task over the limit may keep or drop files, not add', async () => {
    const check = make(undefined);
    await expect(check(30, 30)).resolves.toBeUndefined();
    await expect(check(25, 30)).resolves.toBeUndefined();
    await expect(check(31, 30)).rejects.toBeInstanceOf(ConflictException);
  });
});
