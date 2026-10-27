import {
  ageOn,
  judgeAttestation,
  parseMode,
  type AgeGatePolicy,
} from './age-gate.logic';

const policy: AgeGatePolicy = {
  mode: 'enforce',
  minAge: 18,
  textVersion: 'age-18-v1',
  requireBirthDate: false,
};
const now = new Date('2026-10-25T12:00:00Z');
const ok = { confirmed: true, textVersion: 'age-18-v1' };

describe('age gate logic', () => {
  it('parses the mode, anything unknown is off', () => {
    expect(parseMode('enforce')).toBe('enforce');
    expect(parseMode('record')).toBe('record');
    expect(parseMode('whatever')).toBe('off');
  });

  it('counts whole years, birthday inclusive', () => {
    expect(ageOn('2008-10-25', now)).toBe(18);
    expect(ageOn('2008-10-26', now)).toBe(17);
    expect(ageOn('1990-01-01', now)).toBe(36);
  });

  it('rejects impossible or future dates', () => {
    expect(ageOn('2026-02-30', now)).toBeNull();
    expect(ageOn('2030-01-01', now)).toBeNull();
    expect(ageOn('1800-01-01', now)).toBeNull();
    expect(ageOn('nope', now)).toBeNull();
  });

  it('accepts a ticked box with the current wording', () => {
    expect(judgeAttestation(ok, policy, now)).toEqual({
      ok: true,
      birthDate: null,
    });
  });

  it('refuses a missing, unticked or stale attestation', () => {
    expect(judgeAttestation(undefined, policy, now)).toEqual({
      ok: false,
      reason: 'missing',
    });
    expect(judgeAttestation({ ...ok, confirmed: false }, policy, now)).toEqual({
      ok: false,
      reason: 'not_confirmed',
    });
    expect(
      judgeAttestation({ ...ok, textVersion: 'old' }, policy, now),
    ).toEqual({
      ok: false,
      reason: 'stale_text',
    });
  });

  it('refuses a ticked box with a birth date under 18', () => {
    expect(
      judgeAttestation({ ...ok, birthDate: '2010-05-05' }, policy, now),
    ).toEqual({
      ok: false,
      reason: 'under_age',
    });
  });

  it('keeps an adult birth date', () => {
    expect(
      judgeAttestation({ ...ok, birthDate: '1990-05-05' }, policy, now),
    ).toEqual({
      ok: true,
      birthDate: '1990-05-05',
    });
  });

  it('requires a birth date only when asked', () => {
    expect(
      judgeAttestation(ok, { ...policy, requireBirthDate: true }, now),
    ).toEqual({
      ok: false,
      reason: 'birth_date_required',
    });
    expect(
      judgeAttestation({ ...ok, birthDate: '2026-13-01' }, policy, now),
    ).toEqual({ ok: false, reason: 'bad_birth_date' });
  });
});
