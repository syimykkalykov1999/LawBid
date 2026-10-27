import { buildDisclaimer, parseStateTexts, stateOf } from './legal-disclaimer';

describe('legal disclaimer', () => {
  const base = {
    kind: 'qa' as const,
    defaultText: 'Default.',
    byState: '{"ca":"California text."}',
    extra: '',
  };

  it('uses the state wording when the admin set one', () => {
    const d = buildDisclaimer({ ...base, stateCode: 'CA' });
    expect(d.text).toBe('California text.');
    expect(d.stateCode).toBe('CA');
  });

  it('falls back to the default for other states and bad JSON', () => {
    expect(buildDisclaimer({ ...base, stateCode: 'NY' }).text).toBe('Default.');
    expect(parseStateTexts('not json').size).toBe(0);
    expect(
      buildDisclaimer({ ...base, byState: '[', stateCode: 'CA' }).text,
    ).toBe('Default.');
  });

  it('appends the kind extra and changes version with the text', () => {
    const a = buildDisclaimer({ ...base, extra: 'Extra.', stateCode: null });
    const b = buildDisclaimer({ ...base, stateCode: null });
    expect(a.text).toBe('Default. Extra.');
    expect(a.version).not.toBe(b.version);
  });

  it('reads the state from the query or the payload', () => {
    expect(stateOf({ stateCode: 'tx' }, null)).toBe('TX');
    expect(stateOf({}, { state: { code: 'FL' } })).toBe('FL');
    expect(stateOf({ jurisdiction: 'US' }, null)).toBe('US');
    expect(stateOf({}, [])).toBeNull();
  });
});
