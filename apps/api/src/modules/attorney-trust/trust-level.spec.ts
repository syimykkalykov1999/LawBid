import {
  checkLegalName,
  computeLevel,
  domainOf,
  domainsMatch,
  firmNamesMatch,
  isCleared,
  missingRequirements,
  payoutDelayFor,
  registryConfirms,
  registryNameOf,
  type TrustSignals,
} from './trust-level';

const base: TrustSignals = {
  selfAttested: true,
  licenseConfirmed: false,
  licenseConfirmedBy: null,
  documentsVerified: false,
  stripeKyc: false,
  nameCheck: 'unknown',
  firmLinkConfirmed: false,
};

describe('computeLevel', () => {
  it('self-attested only → 0; nothing without a verified profile', () => {
    expect(computeLevel(base)).toBe(0);
    expect(
      computeLevel({ ...base, selfAttested: false, licenseConfirmed: true }),
    ).toBe(0);
  });

  it('license confirmed → 1', () => {
    expect(
      computeLevel({
        ...base,
        licenseConfirmed: true,
        licenseConfirmedBy: 'registry',
      }),
    ).toBe(1);
  });

  it('identity by Stripe needs a matching name; by staff documents not', () => {
    const l1 = {
      ...base,
      licenseConfirmed: true as const,
      licenseConfirmedBy: 'staff' as const,
    };
    expect(computeLevel({ ...l1, stripeKyc: true })).toBe(1);
    expect(
      computeLevel({ ...l1, stripeKyc: true, nameCheck: 'mismatch' }),
    ).toBe(1);
    expect(computeLevel({ ...l1, stripeKyc: true, nameCheck: 'match' })).toBe(
      2,
    );
    expect(computeLevel({ ...l1, documentsVerified: true })).toBe(2);
  });

  it('both identity sources → 3; identity without a license stays 0', () => {
    expect(
      computeLevel({
        ...base,
        licenseConfirmed: true,
        licenseConfirmedBy: 'registry',
        documentsVerified: true,
        stripeKyc: true,
        nameCheck: 'match',
      }),
    ).toBe(3);
    expect(
      computeLevel({
        ...base,
        documentsVerified: true,
        stripeKyc: true,
        nameCheck: 'match',
      }),
    ).toBe(0);
  });
});

describe('registryConfirms', () => {
  it('needs a passed lookup on a verified license and no flag anywhere', () => {
    const pass = {
      license_status: 'verified',
      registry_flag: null,
      auto_check_result: { result: 'pass' },
    };
    expect(registryConfirms([pass])).toBe(true);
    expect(registryConfirms([{ ...pass, license_status: 'pending' }])).toBe(
      false,
    );
    expect(registryConfirms([{ ...pass, auto_check_result: null }])).toBe(
      false,
    );
    expect(
      registryConfirms([
        pass,
        {
          license_status: 'verified',
          registry_flag: 'not_found',
          auto_check_result: null,
        },
      ]),
    ).toBe(false);
  });

  it('registryNameOf returns the recorded name', () => {
    expect(
      registryNameOf([
        {
          license_status: 'verified',
          registry_flag: null,
          auto_check_result: { result: 'pass', name: 'JANE Q DOE' },
        },
      ]),
    ).toBe('JANE Q DOE');
    expect(registryNameOf([])).toBeNull();
  });
});

describe('checkLegalName', () => {
  const profile = { firstName: 'Jane', lastName: "O'Brien" };
  it('matches apart or full names, ignoring case and punctuation', () => {
    expect(
      checkLegalName({ firstName: 'JANE', lastName: 'OBRIEN' }, profile, null),
    ).toBe('match');
    expect(checkLegalName({ full: 'Jane Marie O Brien' }, profile, null)).toBe(
      'match',
    );
  });
  it('mismatch when Stripe or the registry disagree', () => {
    expect(
      checkLegalName({ firstName: 'John', lastName: 'Smith' }, profile, null),
    ).toBe('mismatch');
    expect(
      checkLegalName(
        { firstName: 'Jane', lastName: 'OBrien' },
        profile,
        'SMITH, JOHN',
      ),
    ).toBe('mismatch');
    expect(
      checkLegalName(
        { firstName: 'Jane', lastName: 'OBrien' },
        profile,
        "O'BRIEN JANE",
      ),
    ).toBe('match');
  });
  it('unknown without a Stripe name or a profile last name', () => {
    expect(checkLegalName({}, profile, null)).toBe('unknown');
    expect(
      checkLegalName(
        { firstName: 'Jane', lastName: 'OBrien' },
        { firstName: 'Jane', lastName: null },
        null,
      ),
    ).toBe('unknown');
  });
});

describe('firm link helpers', () => {
  it('a company account counts once the firm link is shown', () => {
    const l1 = {
      ...base,
      licenseConfirmed: true as const,
      licenseConfirmedBy: 'registry' as const,
    };
    expect(
      computeLevel({ ...l1, stripeKyc: true, nameCheck: 'mismatch' }),
    ).toBe(1);
    expect(
      computeLevel({
        ...l1,
        stripeKyc: true,
        nameCheck: 'mismatch',
        firmLinkConfirmed: true,
      }),
    ).toBe(2);
  });
  it('firm names: noise words and punctuation ignored', () => {
    expect(firmNamesMatch('Smith & Jones, LLP', 'SMITH JONES LLP')).toBe(true);
    expect(firmNamesMatch('Law Offices of Jane Doe', 'Jane Doe PLLC')).toBe(
      true,
    );
    expect(firmNamesMatch('Smith LLP', 'Brown LLC')).toBe(false);
    expect(firmNamesMatch(null, 'Brown LLC')).toBe(false);
  });
  it('domains: site vs e-mail', () => {
    expect(domainOf('https://www.smithlaw.com/team')).toBe('smithlaw.com');
    expect(domainOf('smithlaw.com')).toBe('smithlaw.com');
    expect(domainOf('not a url at all :/')).toBeNull();
    expect(domainsMatch('smithlaw.com', 'smithlaw.com')).toBe(true);
    expect(domainsMatch('mail.smithlaw.com', 'smithlaw.com')).toBe(true);
    expect(domainsMatch('gmail.com', 'smithlaw.com')).toBe(false);
  });
});

describe('payoutDelayFor', () => {
  it('delays payouts until the attorney is cleared', () => {
    expect(payoutDelayFor(false, 7)).toBe(7);
    expect(payoutDelayFor(true, 7)).toBeNull();
    expect(payoutDelayFor(false, 0)).toBeNull();
  });
});

describe('requirements (owner switches)', () => {
  const r = { registry: true, identity: true, documents: false };
  const s0 = {
    selfAttested: true,
    licenseConfirmed: false,
    licenseConfirmedBy: null,
    documentsVerified: false,
    stripeKyc: false,
    nameCheck: 'unknown' as const,
    firmLinkConfirmed: false,
  };
  it('lists what is missing in a fixed order', () => {
    expect(missingRequirements(s0, r)).toEqual(['registry', 'identity']);
    expect(
      missingRequirements(
        { ...s0, licenseConfirmed: true, licenseConfirmedBy: 'registry' },
        r,
      ),
    ).toEqual(['identity']);
    expect(missingRequirements(s0, { ...r, documents: true })).toEqual([
      'registry',
      'identity',
      'documents',
    ]);
    expect(
      missingRequirements(s0, {
        registry: false,
        identity: false,
        documents: false,
      }),
    ).toEqual([]);
  });
  it('cleared = self-attested and (staff said so or nothing is missing)', () => {
    expect(isCleared(s0, r, false)).toBe(false);
    expect(isCleared(s0, r, true)).toBe(true);
    expect(isCleared({ ...s0, selfAttested: false }, r, true)).toBe(false);
    const full = {
      ...s0,
      licenseConfirmed: true,
      licenseConfirmedBy: 'registry' as const,
      stripeKyc: true,
      nameCheck: 'match' as const,
    };
    expect(isCleared(full, r, false)).toBe(true);
    expect(isCleared(full, { ...r, documents: true }, false)).toBe(false);
  });
});
