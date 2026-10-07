import { ConflictException } from '@nestjs/common';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { TasksService } from './tasks.service';

/** Owner 2026-10-07: a task holds at most `tasks.max_files` files. */
describe('TasksService file limit', () => {
  const make = (max: number) => {
    const settings = { number: jest.fn().mockResolvedValue(max) };
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

  it('allows up to the limit', async () => {
    await expect(make(10)(10)).resolves.toBeUndefined();
  });

  it('refuses one more with TASK_FILES_LIMIT and the max', async () => {
    const err = await make(10)(11).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      code: ErrorCode.TASK_FILES_LIMIT,
      details: { max: 10 },
    });
  });

  it('an older task over the limit may keep or drop files, not add', async () => {
    const check = make(10);
    await expect(check(30, 30)).resolves.toBeUndefined();
    await expect(check(25, 30)).resolves.toBeUndefined();
    await expect(check(31, 30)).rejects.toBeInstanceOf(ConflictException);
  });

  it('0 = no limit', async () => {
    await expect(make(0)(100)).resolves.toBeUndefined();
  });
});
