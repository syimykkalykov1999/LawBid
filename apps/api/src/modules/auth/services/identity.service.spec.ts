import {
  IdentityService,
  type CollisionResult,
  type FindOrCreateResult,
} from './identity.service';

/** Only the Prisma surface IdentityService actually touches. */
function buildFakePrisma(overrides: {
  findUniqueIdentifier?: jest.Mock;
  findFirstUser?: jest.Mock;
  createUser?: jest.Mock;
}) {
  return {
    userIdentifier: {
      findUnique:
        overrides.findUniqueIdentifier ?? jest.fn().mockResolvedValue(null),
      // availableMethodsFor() is only reached on the collision branch —
      // returns an empty list by default, tests that exercise that
      // branch don't assert on its contents.
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findFirst: overrides.findFirstUser ?? jest.fn().mockResolvedValue(null),
      create: overrides.createUser ?? jest.fn(),
    },
  };
}

describe('IdentityService.findOrCreateForSocial — no-auto-merge collision policy', () => {
  it('returns the existing user when (provider, providerUid) is already linked', async () => {
    const existingUser = { id: 'user-1', status: 'active' };
    const findUniqueIdentifier = jest
      .fn()
      .mockResolvedValue({ user: existingUser });
    const prisma = buildFakePrisma({ findUniqueIdentifier });
    const service = new IdentityService(prisma as never);

    const result = (await service.findOrCreateForSocial(
      'google',
      'google-sub-123',
      'someone@example.com',
      undefined,
      undefined,
    )) as FindOrCreateResult;

    expect(result.isNewUser).toBe(false);
    expect(result.user).toBe(existingUser);
    // Collision check must NOT run at all once the identifier itself
    // resolves — findFirst (the email-collision lookup) is never called.
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('refuses to auto-merge: a verified email owned by a DIFFERENT account returns a collision, not a merge', async () => {
    const otherAccount = { id: 'user-2' };
    const findUniqueIdentifier = jest.fn().mockResolvedValue(null);
    const findFirstUser = jest.fn().mockResolvedValue(otherAccount);
    const prisma = buildFakePrisma({ findUniqueIdentifier, findFirstUser });
    const service = new IdentityService(prisma as never);

    const result = (await service.findOrCreateForSocial(
      'apple',
      'apple-sub-999',
      'Taken@Example.com',
      undefined,
      undefined,
    )) as CollisionResult;

    expect(result.collision).toBe(true);
    expect(result.maskedIdentifier).toContain('@');
    expect(result.maskedIdentifier).not.toContain('Taken@Example.com');
    // The whole point of this policy: no user.create call happened.
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates a brand-new user when neither the identifier nor the email match anything', async () => {
    const createUser = jest
      .fn()
      .mockResolvedValue({ id: 'user-3', status: 'active' });
    const prisma = buildFakePrisma({
      findUniqueIdentifier: jest.fn().mockResolvedValue(null),
      findFirstUser: jest.fn().mockResolvedValue(null),
      createUser,
    });
    const service = new IdentityService(prisma as never);

    const result = (await service.findOrCreateForSocial(
      'google',
      'google-sub-new',
      'brandnew@example.com',
      'Ada',
      'Lovelace',
    )) as FindOrCreateResult;

    expect(result.isNewUser).toBe(true);
    expect(createUser).toHaveBeenCalledTimes(1);
    const createArgs = createUser.mock.calls[0][0];
    expect(createArgs.data.email).toBe('brandnew@example.com');
    expect(createArgs.data.first_name).toBe('Ada');
  });

  it('creates a new user with no email collision check at all when the provider gave no verified email (e.g. private Apple relay declined)', async () => {
    const findFirstUser = jest.fn();
    const createUser = jest
      .fn()
      .mockResolvedValue({ id: 'user-4', status: 'active' });
    const prisma = buildFakePrisma({
      findUniqueIdentifier: jest.fn().mockResolvedValue(null),
      findFirstUser,
      createUser,
    });
    const service = new IdentityService(prisma as never);

    await service.findOrCreateForSocial(
      'apple',
      'apple-sub-anon',
      undefined,
      undefined,
      undefined,
    );

    expect(findFirstUser).not.toHaveBeenCalled();
    expect(createUser).toHaveBeenCalledTimes(1);
  });
});
