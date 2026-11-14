import { OnboardingService } from './onboarding.service';

/** Detective R2B-8 (14.11): `data` merged without bound — every save could
 * add ~256 KB of new keys, and `/users/me` returns the whole row. The
 * merged object is capped by `users.onboarding_data_max_kb` (64; 0 = off). */
function setup(maxKb: number, prev: Record<string, unknown> = {}) {
  const upsert = jest.fn(() => Promise.resolve({}));
  const prisma = {
    onboardingState: {
      findUnique: jest.fn(() => Promise.resolve({ data: prev })),
      upsert,
    },
  };
  const settings = {
    number: jest.fn((k: string) =>
      Promise.resolve(k === 'users.onboarding_data_max_kb' ? maxKb : NaN),
    ),
  };
  const svc = new OnboardingService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    settings as never,
  );
  return { svc, upsert };
}

const big = (kb: number) => 'x'.repeat(kb * 1024);

describe('OnboardingService.saveStep data cap (R2B-8)', () => {
  it('refuses a save that makes the stored data bigger than the cap', async () => {
    const { svc, upsert } = setup(64, { a: big(40) });
    await expect(
      svc.saveStep('u1', { currentStep: 'x', data: { b: big(30) } } as never),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('a small save passes; 0 = no cap', async () => {
    const ok = setup(64, { a: 'x' });
    await ok.svc.saveStep('u1', {
      currentStep: 'x',
      data: { b: 'y' },
    } as never);
    expect(ok.upsert).toHaveBeenCalledTimes(1);
    const off = setup(0, { a: big(40) });
    await off.svc.saveStep('u1', {
      currentStep: 'x',
      data: { b: big(30) },
    } as never);
    expect(off.upsert).toHaveBeenCalledTimes(1);
  });
});
