import { findPhoneNumbersInText } from 'libphonenumber-js/max';

/**
 * Owner 2026-10-28 (legal safety): finds private information and
 * confidential case details in a PUBLIC question or answer — SSN / tax
 * ids, card numbers, addresses, case numbers, immigration ids, dates of
 * birth, phones, emails and the names of the other side of a dispute.
 *
 * No single library covers this, so it is assembled from proven parts:
 *  - phones: libphonenumber-js `findPhoneNumbersInText` (Google's metadata,
 *    already a dependency);
 *  - SSN / ITIN / EIN, card (Luhn), passport, driver licence, dates of
 *    birth: the pattern + context-word approach of Microsoft Presidio's US
 *    recognizers (UsSsnRecognizer, CreditCardRecognizer, UsPassport...,
 *    UsDriverLicense...), ported to JS with the SSA validity rules;
 *  - addresses, case / docket numbers, USCIS ids and party names: US-legal
 *    regex sets with cue words ("sued by", "case no.", "A-number"); these
 *    are heuristics, so the default mode only records (`warn`).
 * A false positive costs a masked word in `redact` mode or a refused post in
 * `block` mode; a false negative is the same as today.
 */

export const PII_KINDS = [
  'ssn',
  'card',
  'address',
  'case_number',
  'party_name',
  'immigration_id',
  'dob',
  'id_number',
  'phone',
  'email',
] as const;
export type PiiKind = (typeof PII_KINDS)[number];

export interface PiiFinding {
  kind: PiiKind;
  start: number;
  end: number;
}

/** Same marker family as the contact mask (cases.public `CONTACT_MASK`). */
export const PRIVATE_MASK = '[данные скрыты]';
export const CONTACT_MARK = '[контакт скрыт]';

const STATES =
  'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY';

/** Letters of a cue word in any case (JS has no inline `(?i:)` yet). */
function ci(word: string): string {
  return word
    .split('')
    .map((c) =>
      /[a-z]/i.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : c,
    )
    .join('');
}

/** `a|b|c` of cue words, each case-insensitive, spaces flexible. */
function cues(words: string[]): string {
  return words.map((w) => ci(w).replace(/ /g, '\\s+')).join('|');
}

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function validSsn(area: string, group: string, serial: string): boolean {
  if (area === '000' || area === '666' || area[0] === '9') return false;
  return group !== '00' && serial !== '0000';
}

type Finder = (text: string) => PiiFinding[];

function all(
  re: RegExp,
  text: string,
  kind: PiiKind,
  pick?: (m: RegExpMatchArray) => [number, number] | null,
): PiiFinding[] {
  const out: PiiFinding[] = [];
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    const span = pick ? pick(m) : [idx, idx + m[0].length];
    if (span) out.push({ kind, start: span[0], end: span[1] });
  }
  return out;
}

/** Offset of capture group [n] inside the match (needs the `d` flag). */
function groupSpan(m: RegExpMatchArray, n: number): [number, number] | null {
  const ind = (m as unknown as { indices?: [number, number][] }).indices;
  const g = ind?.[n];
  return g ? [g[0], g[1]] : null;
}

// --- SSN, ITIN, EIN --------------------------------------------------------

const SSN_FORMATTED = /(?<![\d-])(\d{3})([- ])(\d{2})\2(\d{4})(?![\d-])/g;
const ITIN_FORMATTED =
  /(?<![\d-])9\d{2}[- ](?:7\d|8[0-8]|9[0-2]|9[4-9])[- ]\d{4}(?![\d-])/g;
const EIN_FORMATTED = new RegExp(
  `(?:${cues(['ein', 'tax id', 'employer identification', 'fein'])})\\D{0,20}(\\d{2}-\\d{7})`,
  'dg',
);
const SSN_CUED = new RegExp(
  `(?:${cues(['ssn', 'social security', 'social security number', 'ss#', 'ss #'])})\\D{0,20}(\\d{9})(?!\\d)`,
  'dg',
);

const findSsn: Finder = (t) => [
  ...[...t.matchAll(SSN_FORMATTED)]
    .filter((m) => validSsn(m[1], m[3], m[4]))
    .map((m) => ({
      kind: 'ssn' as const,
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    })),
  ...all(ITIN_FORMATTED, t, 'ssn'),
  ...all(EIN_FORMATTED, t, 'ssn', (m) => groupSpan(m, 1)),
  ...all(SSN_CUED, t, 'ssn', (m) => groupSpan(m, 1)),
];

// --- card ------------------------------------------------------------------

const CARD_RE = /(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g;

const findCard: Finder = (t) => {
  const out: PiiFinding[] = [];
  for (const m of t.matchAll(CARD_RE)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) {
      const start = m.index ?? 0;
      out.push({ kind: 'card', start, end: start + m[0].length });
    }
  }
  return out;
};

// --- ids: passport, driver licence ------------------------------------------

const ID_CUED = new RegExp(
  `(?:${cues(['passport', "driver's license", 'drivers license', "driver's licence", 'driver license', 'dl', 'state id'])})(?:\\s+(?:${cues(['no', 'number', '#', 'num'])})\\.?)?[:#\\s]+([A-Z0-9][A-Z0-9-]{5,14})(?![A-Za-z0-9])`,
  'dg',
);

const findIdNumber: Finder = (t) =>
  all(ID_CUED, t, 'id_number', (m) =>
    /\d/.test(m[1]) ? groupSpan(m, 1) : null,
  );

// --- immigration -----------------------------------------------------------

const A_NUMBER = /(?<![A-Za-z0-9])[Aa][- ]?\d{3}[- ]?\d{3}[- ]?\d{2,3}(?!\d)/g;
const A_NUMBER_CUED = new RegExp(
  `(?:${cues(['a-number', 'a number', 'alien number', 'alien registration'])})[:#\\s]*([Aa]?[- ]?\\d{8,9})(?!\\d)`,
  'dg',
);
const USCIS_RECEIPT =
  /(?<![A-Za-z])(?:EAC|WAC|LIN|SRC|NBC|MSC|IOE|YSC)\d{10}(?!\d)/g;

const findImmigration: Finder = (t) => [
  ...all(A_NUMBER, t, 'immigration_id', (m) => {
    const digits = m[0].replace(/\D/g, '');
    return digits.length === 8 || digits.length === 9
      ? [m.index ?? 0, (m.index ?? 0) + m[0].length]
      : null;
  }),
  ...all(A_NUMBER_CUED, t, 'immigration_id', (m) => groupSpan(m, 1)),
  ...all(USCIS_RECEIPT, t, 'immigration_id'),
];

// --- case / docket numbers ---------------------------------------------------

const CASE_FEDERAL =
  /(?<![\w:])\d{1,2}:\d{2}-[A-Za-z]{2,3}-\d{3,6}(?:-[A-Za-z]{2,5})*(?![\w])/g;
const CASE_CODED = new RegExp(
  `(?<![\\w])\\d{2,4}[- ]?(?:${[
    'cv',
    'cr',
    'cf',
    'fa',
    'dr',
    'dv',
    'sc',
    'mc',
    'bk',
    'ap',
    'ch',
    'pr',
    'jv',
    'cvs',
    'fl',
    'cl',
    'ca',
    'cm',
  ]
    .map(ci)
    .join('|')})[- ]?\\d{3,8}(?![\\w])`,
  'g',
);
const CASE_CUED = new RegExp(
  `(?:${cues(['case', 'docket', 'cause', 'index', 'file', 'matter', 'claim', 'petition', 'appeal', 'court'])})\\s*(?:${cues(['no', 'number', 'num'])}\\.?|#)\\s*[:.]?\\s*([A-Z0-9][A-Za-z0-9\\-/.:]{3,24})`,
  'dg',
);

const findCaseNumber: Finder = (t) => [
  ...all(CASE_FEDERAL, t, 'case_number'),
  ...all(CASE_CODED, t, 'case_number'),
  ...all(CASE_CUED, t, 'case_number', (m) =>
    /\d/.test(m[1]) ? groupSpan(m, 1) : null,
  ),
];

// --- address -----------------------------------------------------------------

const SUFFIX =
  'Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Terrace|Ter|Circle|Cir|Highway|Hwy|Parkway|Pkwy|Square|Sq';
const NOT_STREET_WORDS = new Set([
  'dollars',
  'dollar',
  'usd',
  'years',
  'year',
  'days',
  'day',
  'weeks',
  'week',
  'months',
  'month',
  'hours',
  'hour',
  'minutes',
  'minute',
  'people',
  'times',
  'percent',
  'miles',
  'mile',
  'feet',
  'pounds',
  'units',
  'items',
  'cases',
  'emails',
  'letters',
  'calls',
  'pages',
  'payments',
  'months,',
  'k',
]);
const STREET_RE = new RegExp(
  `(?<![\\w#])(\\d{1,6})\\s+((?:[NSEW]\\.?\\s+)?(?:[A-Za-z0-9][A-Za-z0-9.'’-]*\\s+){1,3}(?:${SUFFIX.split('|').map(ci).join('|')}))\\b\\.?(?:,?\\s*(?:${cues(['apt', 'apartment', 'suite', 'ste', 'unit'])}|#)\\.?\\s*[A-Za-z0-9-]+)?`,
  'g',
);
const PO_BOX = /(?<![A-Za-z])P\.?\s?O\.?\s+Box\s+\d+/gi;
const STATE_ZIP = new RegExp(
  `(?<![A-Za-z])(?:${STATES})\\s+\\d{5}(?:-\\d{4})?(?!\\d)`,
  'g',
);

const findAddress: Finder = (t) => [
  ...[...t.matchAll(STREET_RE)]
    .filter((m) => {
      const first = m[2].trim().split(/\s+/)[0].toLowerCase();
      return !NOT_STREET_WORDS.has(first);
    })
    .map((m) => ({
      kind: 'address' as const,
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    })),
  ...all(PO_BOX, t, 'address'),
  ...all(STATE_ZIP, t, 'address'),
];

// --- date of birth -----------------------------------------------------------

const DOB_RE = new RegExp(
  `(?:${cues(['born on', 'born', 'dob', 'd.o.b.', 'date of birth', 'birthdate', 'birth date'])})[:\\s]+(\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|[A-Z][a-z]{2,8}\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+[A-Z][a-z]{2,8}\\.?,?\\s+\\d{4})`,
  'dg',
);
const findDob: Finder = (t) => all(DOB_RE, t, 'dob', (m) => groupSpan(m, 1));

// --- the other side's names --------------------------------------------------

/** Words that make a "Capitalized Capitalized" pair a place or a law, not a person. */
const NOT_A_NAME = new Set(
  (
    'federal state court united states supreme district department county city ' +
    'law act code section social security medicare medicaid internal revenue ' +
    'service immigration bureau office board commission agency ' +
    'monday tuesday wednesday thursday friday saturday sunday ' +
    'january february march april may june july august september october ' +
    'november december new york texas california florida illinois ohio ' +
    'pennsylvania georgia michigan washington virginia carolina jersey'
  ).split(' '),
);

const PERSON =
  "(?:(?:Mr|Mrs|Ms|Dr|Mx|Judge|Hon)\\.?\\s+)?[A-Z][a-z]{1,20}(?:\\s+[A-Z]\\.)?(?:\\s+[A-Z][a-z'’-]{1,20}){1,2}(?:\\s+(?:Jr|Sr|II|III)\\.?)?";
const COMPANY =
  "(?:[A-Z][A-Za-z&'’-]+\\s+){1,4}(?:LLC|L\\.L\\.C\\.|Inc\\.?|Corp\\.?|Corporation|Company|LLP|Ltd\\.?|Co\\.)";
const PARTY_CUES = cues([
  'sued by',
  'suing',
  'sue',
  'sued',
  'against',
  'versus',
  'vs.',
  'vs',
  'opposing party',
  'opposing counsel',
  'defendant',
  'plaintiff',
  'respondent',
  'petitioner',
  'landlord',
  'employer',
  'boss',
  'ex-husband',
  'ex husband',
  'ex-wife',
  'ex wife',
  'ex-spouse',
  'ex-partner',
  'ex-boyfriend',
  'ex-girlfriend',
  'husband',
  'wife',
  'my lawyer',
  'my attorney',
  'judge',
]);
const PARTY_CUED = new RegExp(
  `(?:${PARTY_CUES})(?:\\s+(?:is|was|named|called|being)|[,:])?\\s+(${PERSON}|${COMPANY})`,
  'dg',
);
const CAPTION = new RegExp(
  `([A-Z][a-z]{2,20}(?:\\s+[A-Z][a-z]{2,20})?)\\s+v\\.?\\s+([A-Z][a-z]{2,20}(?:\\s+[A-Z][a-z]{2,20})?)`,
  'dg',
);

function looksLikeName(s: string): boolean {
  const words = s.toLowerCase().replace(/[.,]/g, '').split(/\s+/);
  return !words.some((w) => NOT_A_NAME.has(w));
}

const findParty: Finder = (t) => {
  const out: PiiFinding[] = [];
  for (const m of t.matchAll(PARTY_CUED)) {
    if (!looksLikeName(m[1])) continue;
    const span = groupSpan(m, 1);
    if (span) out.push({ kind: 'party_name', start: span[0], end: span[1] });
  }
  for (const m of t.matchAll(CAPTION)) {
    if (!looksLikeName(m[1]) || !looksLikeName(m[2])) continue;
    const idx = m.index ?? 0;
    out.push({ kind: 'party_name', start: idx, end: idx + m[0].length });
  }
  return out;
};

// --- contacts ----------------------------------------------------------------

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const findPhone: Finder = (t) => {
  try {
    return findPhoneNumbersInText(t, 'US').map((p) => ({
      kind: 'phone' as const,
      start: p.startsAt,
      end: p.endsAt,
    }));
  } catch {
    return [];
  }
};
const findEmail: Finder = (t) => all(EMAIL_RE, t, 'email');

const FINDERS: Record<PiiKind, Finder> = {
  ssn: findSsn,
  card: findCard,
  address: findAddress,
  case_number: findCaseNumber,
  party_name: findParty,
  immigration_id: findImmigration,
  dob: findDob,
  id_number: findIdNumber,
  phone: findPhone,
  email: findEmail,
};

/** `ssn, card` → kinds, unknown names dropped. */
export function parseKinds(list: string): PiiKind[] {
  const wanted = new Set(
    list
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return PII_KINDS.filter((k) => wanted.has(k));
}

/** Findings of the chosen kinds, sorted, overlaps dropped (first wins). */
export function detectPii(
  text: string,
  kinds: readonly PiiKind[] = PII_KINDS,
): PiiFinding[] {
  if (!text) return [];
  const raw = kinds.flatMap((k) => FINDERS[k](text));
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: PiiFinding[] = [];
  let edge = -1;
  for (const f of raw) {
    if (f.start >= edge) {
      out.push(f);
      edge = f.end;
    }
  }
  return out;
}

/** Replaces each finding with a mask. */
export function redactPii(text: string, findings: PiiFinding[]): string {
  let out = '';
  let at = 0;
  for (const f of findings) {
    out += text.slice(at, f.start);
    out +=
      f.kind === 'phone' || f.kind === 'email' ? CONTACT_MARK : PRIVATE_MASK;
    at = f.end;
  }
  return out + text.slice(at);
}

export function kindsOf(findings: PiiFinding[]): PiiKind[] {
  return [...new Set(findings.map((f) => f.kind))];
}
