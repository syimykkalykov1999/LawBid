import { missingRequirements } from './onboarding.service';

describe('missingRequirements (docs/01_FOUNDATION_AUTH.md §11)', () => {
  const now = new Date();
  const base = {
    role: null,
    first_name: null,
    last_name: null,
    phone_verified_at: null,
    email_verified_at: null,
  };

  it('fresh account: consents, role, name', () => {
    expect(missingRequirements(base, false)).toEqual([
      'consents',
      'role',
      'name',
    ]);
  });

  it('client needs BOTH phone and email verified', () => {
    const client = {
      ...base,
      role: 'client' as const,
      first_name: 'A',
      last_name: 'B',
    };
    expect(missingRequirements(client, true)).toEqual([
      'phone_verified',
      'email_verified',
    ]);
    expect(
      missingRequirements({ ...client, phone_verified_at: now }, true),
    ).toEqual(['email_verified']);
    expect(
      missingRequirements(
        { ...client, phone_verified_at: now, email_verified_at: now },
        true,
      ),
    ).toEqual([]);
  });

  it('attorney needs only a verified phone', () => {
    const attorney = {
      ...base,
      role: 'attorney' as const,
      first_name: 'A',
      last_name: 'B',
    };
    expect(missingRequirements(attorney, true)).toEqual(['phone_verified']);
    expect(
      missingRequirements({ ...attorney, phone_verified_at: now }, true),
    ).toEqual([]);
  });

  it('with profile facts: client needs a state, attorney a licensed state', () => {
    const verified = {
      ...base,
      first_name: 'A',
      last_name: 'B',
      phone_verified_at: now,
      email_verified_at: now,
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
