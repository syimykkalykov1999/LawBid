import { ConflictException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  ASSISTANT_DUTIES,
  clampMaxDuties,
  DEFAULT_MAX_DUTIES,
  isUnlimitedDuties,
} from './assistant-duties';
import { AssistantsService } from './assistants.service';

/** Owner 2026-10-22: one assistant holds at most `assistants.max_duties`
 * (3 by default) — more assistants, nobody with the whole account. */
describe('assistant duty limit', () => {
  const make = (stored?: number) => {
    const svc = Object.create(AssistantsService.prototype) as AssistantsService;
    Object.assign(svc, {
      settings:
        stored === undefined
          ? undefined
          : { number: jest.fn().mockResolvedValue(stored) },
    });
    return svc;
  };

  it('defaults to 3 and stays within 1..10', () => {
    expect(DEFAULT_MAX_DUTIES).toBe(3);
    expect(clampMaxDuties(undefined)).toBe(3);
    // R-401: 0 = «все».
    expect(clampMaxDuties(0)).toBe(ASSISTANT_DUTIES.length);
    expect(clampMaxDuties(-1)).toBe(1);
    expect(clampMaxDuties(99)).toBe(ASSISTANT_DUTIES.length);
    expect(clampMaxDuties(4.7)).toBe(4);
  });

  it('allows up to the limit', async () => {
    await expect(
      make().assertDutyCount([], ['calls', 'chats', 'tasks']),
    ).resolves.toBeUndefined();
  });

  it('refuses one more with ASSISTANT_TOO_MANY_DUTIES and the max', async () => {
    const e = await make()
      .assertDutyCount([], ['calls', 'chats', 'tasks', 'files'])
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ConflictException);
    expect((e as ConflictException).getResponse()).toMatchObject({
      code: ErrorCode.ASSISTANT_TOO_MANY_DUTIES,
      details: { max: 3, requested: 4 },
    });
  });

  it('«все» (0): every duty fits one assistant', async () => {
    await expect(
      make(0).assertDutyCount([], [...ASSISTANT_DUTIES]),
    ).resolves.toBeUndefined();
    expect(isUnlimitedDuties(0)).toBe(true);
    expect(isUnlimitedDuties(3)).toBe(false);
  });

  it('follows the admin value', async () => {
    await expect(
      make(5).assertDutyCount(
        [],
        ['calls', 'chats', 'tasks', 'files', 'cases'],
      ),
    ).resolves.toBeUndefined();
    await expect(
      make(2).assertDutyCount([], ['calls', 'chats', 'tasks']),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('an assistant over the limit from before may keep or lose duties, not gain', async () => {
    const before = ['calls', 'chats', 'tasks', 'files', 'cases'];
    const svc = make();
    await expect(svc.assertDutyCount(before, before)).resolves.toBeUndefined();
    await expect(
      svc.assertDutyCount(before, before.slice(0, 4)),
    ).resolves.toBeUndefined();
    await expect(
      svc.assertDutyCount(before, [...before.slice(0, 4), 'posts']),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
