import { ForbiddenException } from '@nestjs/common';
import { PostAttachmentsPolicy } from './post-attachments.policy';

// Owner 2026-10-13: who may add documents and extra photos to a post.
function make(opts: {
  mode: string;
  role?: 'client' | 'attorney';
  planFlag?: boolean;
  isPaid?: boolean;
  badge?: boolean;
  licence?: boolean;
}) {
  const settings = { string: jest.fn(() => Promise.resolve(opts.mode)) };
  const prisma = {
    user: {
      findUnique: jest.fn(() =>
        Promise.resolve({ role: opts.role ?? 'attorney' }),
      ),
    },
    clientVerification: {
      findMany: jest.fn(() =>
        Promise.resolve(
          opts.badge
            ? [
                {
                  user_id: 'u',
                  status: 'approved',
                  sub_status: 'active',
                  current_period_end: null,
                },
              ]
            : [],
        ),
      ),
    },
    attorneyLicense: {
      findFirst: jest.fn(() =>
        Promise.resolve(opts.licence ? { id: 'l' } : null),
      ),
    },
  };
  const entitlements = {
    forUser: jest.fn(() =>
      Promise.resolve({
        values: { post_attachments: opts.planFlag ?? false },
        isPaid: opts.isPaid ?? false,
      }),
    ),
  };
  return new PostAttachmentsPolicy(
    settings as never,
    prisma as never,
    entitlements as never,
  );
}

describe('PostAttachmentsPolicy', () => {
  it('off for all: nobody, even a paid verified attorney', async () => {
    const p = make({
      mode: 'off_for_all',
      planFlag: true,
      isPaid: true,
      licence: true,
    });
    expect(await p.canAttach('u')).toBe(false);
    await expect(p.assertCanAttach('u')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('off for all: files already attached are hidden too', async () => {
    const p = make({ mode: 'off_for_all' });
    expect((await p.visibleFor(['a', 'b'])).size).toBe(0);
  });

  it('on for all: everybody', async () => {
    expect(await make({ mode: 'on_for_all' }).canAttach('u')).toBe(true);
  });

  it('a value nobody knows is off', async () => {
    expect(await make({ mode: 'weird' }).canAttach('u')).toBe(false);
  });

  it('by subscription: an attorney needs the plan flag, a paid plan and a verified licence', async () => {
    const base = {
      mode: 'by_subscription',
      planFlag: true,
      isPaid: true,
      licence: true,
    };
    expect(await make(base).canAttach('u')).toBe(true);
    expect(await make({ ...base, planFlag: false }).canAttach('u')).toBe(false);
    expect(await make({ ...base, isPaid: false }).canAttach('u')).toBe(false);
    expect(await make({ ...base, licence: false }).canAttach('u')).toBe(false);
  });

  it('by subscription: a client needs the plan flag and an active gold badge', async () => {
    const base = {
      mode: 'by_subscription',
      role: 'client' as const,
      planFlag: true,
      badge: true,
    };
    expect(await make(base).canAttach('u')).toBe(true);
    expect(await make({ ...base, badge: false }).canAttach('u')).toBe(false);
    expect(await make({ ...base, planFlag: false }).canAttach('u')).toBe(false);
  });
});
