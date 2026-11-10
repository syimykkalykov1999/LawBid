import { BadRequestException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

/**
 * Security audit 2026-11-08 (L7): POST /users/me/role accepted «assistant»
 * from anyone. The role comes only with an attorney's invite code; picking
 * it is refused, and an assistant re-sending their own role still passes.
 */
function make(role: string | null) {
  const update = jest.fn(() => Promise.resolve({}));
  const tx = {
    user: {
      findUnique: jest.fn(() =>
        Promise.resolve({ role, onboarding_state: null }),
      ),
      update,
    },
  };
  const prisma = {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const svc = new OnboardingService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { svc, update };
}

describe('OnboardingService.setRole and the assistant role (audit L7)', () => {
  it('a fresh account cannot pick «assistant»', async () => {
    const m = make(null);
    await expect(m.svc.setRole('u1', 'assistant')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(m.update).not.toHaveBeenCalled();
  });

  it('an assistant (set by the invite code) sending it again is fine', async () => {
    const m = make('assistant');
    await expect(m.svc.setRole('u1', 'assistant')).resolves.toBeUndefined();
    expect(m.update).not.toHaveBeenCalled();
  });

  it('client and attorney are picked as before', async () => {
    const m = make(null);
    await expect(m.svc.setRole('u1', 'attorney')).resolves.toBeUndefined();
    expect(m.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { role: 'attorney' },
    });
  });
});
