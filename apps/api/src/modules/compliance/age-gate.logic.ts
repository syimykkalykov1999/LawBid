/**
 * 2026-10-25 (legal register C3, COPPA): pure rules of the 18+ gate.
 * Nothing here touches the database, so the whole policy is unit-tested.
 */
export type AgeGateMode = 'off' | 'record' | 'enforce';

export interface AgeAttestationInput {
  /** The person ticked "I am 18 or older" (the wording of `textVersion`). */
  confirmed: boolean;
  /** Which wording the app showed (compliance.age_gate.text_version). */
  textVersion: string;
  /** Optional, `YYYY-MM-DD`. */
  birthDate?: string;
}

export interface AgeGatePolicy {
  mode: AgeGateMode;
  minAge: number;
  textVersion: string;
  requireBirthDate: boolean;
}

export type AgeVerdict =
  | { ok: true; birthDate: string | null }
  | {
      ok: false;
      reason:
        | 'missing'
        | 'not_confirmed'
        | 'stale_text'
        | 'birth_date_required'
        | 'bad_birth_date'
        | 'under_age';
    };

export function parseMode(value: string): AgeGateMode {
  return value === 'record' || value === 'enforce' ? value : 'off';
}

/** Whole years between [birth] (`YYYY-MM-DD`) and [now], UTC; null when the
 * string is not a real calendar date in the past. */
export function ageOn(birth: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  if (date.getTime() > now.getTime() || y < 1900) return null;
  let age = now.getUTCFullYear() - y;
  const beforeBirthday =
    now.getUTCMonth() < mo - 1 ||
    (now.getUTCMonth() === mo - 1 && now.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Judges an attestation against the policy. A birth date, when sent, is
 * always checked (a child who types a real birth date is refused even if
 * the box is ticked); it is only required with `requireBirthDate`.
 */
export function judgeAttestation(
  input: AgeAttestationInput | undefined | null,
  policy: AgeGatePolicy,
  now = new Date(),
): AgeVerdict {
  if (!input) return { ok: false, reason: 'missing' };
  if (input.confirmed !== true) return { ok: false, reason: 'not_confirmed' };
  if (input.textVersion !== policy.textVersion)
    return { ok: false, reason: 'stale_text' };
  const birth = input.birthDate?.trim() || undefined;
  if (!birth) {
    return policy.requireBirthDate
      ? { ok: false, reason: 'birth_date_required' }
      : { ok: true, birthDate: null };
  }
  const age = ageOn(birth, now);
  if (age === null) return { ok: false, reason: 'bad_birth_date' };
  if (age < policy.minAge) return { ok: false, reason: 'under_age' };
  return { ok: true, birthDate: birth };
}
