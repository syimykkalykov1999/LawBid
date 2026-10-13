import { missingRequirements } from './onboarding.service';

describe('missingRequirements (docs/01_FOUNDATION_AUTH.md §11)', () => {
  const now = new Date();
  const base = {
    role: null,
    first_name: null,
    last_name: null,
    phone_verified_at: null,
    email_verified_at: null,
    email: null as string | null,
  };

  it('fresh account: consents, role, name', () => {
    expect(missingRequirements(base, false)).toEqual([
      'consents',
      'role',
      'name',
    ]);
  });

  it('owner 2026-10-04: an assistant (code sign-in) needs no phone', () => {
    expect(
      missingRequirements(
        {
          ...base,
          role: 'assistant' as const,
          first_name: 'A',
          last_name: 'B',
        },
        true,
      ),
    ).toEqual([]);
  });

  it('owner 2026-10-13: client needs a verified phone and a profile e-mail (no code)', () => {
    const client = {
      ...base,
      role: 'client' as const,
      first_name: 'A',
      last_name: 'B',
    };
    expect(missingRequirements(client, true)).toEqual([
      'phone_verified',
      'email',
    ]);
    expect(
      missingRequirements({ ...client, phone_verified_at: now }, true),
    ).toEqual(['email']);
    expect(
      missingRequirements(
        { ...client, phone_verified_at: now, email: 'a@b.co' },
        true,
      ),
    ).toEqual([]);
  });

  it('a finished onboarding is not sent back for the e-mail', () => {
    const client = {
      ...base,
      role: 'client' as const,
      first_name: 'A',
      last_name: 'B',
      phone_verified_at: now,
    };
    expect(
      missingRequirements(client, true, undefined, undefined, false),
    ).toEqual([]);
  });

  it('attorney needs a verified phone and a profile e-mail', () => {
    const attorney = {
      ...base,
      role: 'attorney' as const,
      first_name: 'A',
      last_name: 'B',
    };
    expect(missingRequirements(attorney, true)).toEqual([
      'phone_verified',
      'email',
    ]);
    expect(
      missingRequirements(
        { ...attorney, phone_verified_at: now, email: 'a@b.co' },
        true,
      ),
    ).toEqual([]);
  });

  it('with profile facts: client needs a state, attorney a licensed state', () => {
    const verified = {
      ...base,
      first_name: 'A',
      last_name: 'B',
      phone_verified_at: now,
      email_verified_at: now,
      email: 'a@b.co',
    };
    const noProfile = {
      clientHasState: false,
      attorneyHasLicensedStates: false,
    };
    expect(
      missingRequirements({ ...verified, role: 'client' }, true, noProfile),
    ).toEqual(['state']);
    expect(
      missingRequirements({ ...verified, role: 'client' }, true, {
        ...noProfile,
        clientHasState: true,
      }),
    ).toEqual([]);
    expect(
      missingRequirements({ ...verified, role: 'attorney' }, true, noProfile),
    ).toEqual(['licensed_states']);
    expect(
      missingRequirements({ ...verified, role: 'attorney' }, true, {
        ...noProfile,
        attorneyHasLicensedStates: true,
      }),
    ).toEqual([]);
    // No role yet -> no profile requirement.
    expect(missingRequirements(verified, true, noProfile)).toEqual(['role']);
  });

  it('attorney needs a clean photo (docs/03 §4.1, OQ-012); client does not', () => {
    const verified = {
      ...base,
      first_name: 'A',
      last_name: 'B',
      phone_verified_at: now,
      email_verified_at: now,
      email: 'a@b.co',
    };
    const facts = { clientHasState: true, attorneyHasLicensedStates: true };
    expect(
      missingRequirements(
        { ...verified, role: 'attorney' },
        true,
        facts,
        false,
      ),
    ).toEqual(['photo']);
    expect(
      missingRequirements({ ...verified, role: 'attorney' }, true, facts, true),
    ).toEqual([]);
    expect(
      missingRequirements({ ...verified, role: 'client' }, true, facts, false),
    ).toEqual([]);
  });
});
