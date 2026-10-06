/**
 * Owner 2026-10-05: outreach (Привлечение) — the team cold-calls and
 * emails leads, each employee with their own partner (referral) link, so
 * the owner sees who brings people in. Settings live in app_config.
 */
export const OUTREACH_SETTINGS_KEY = 'outreach.program';

export const LEAD_KINDS = ['attorney', 'client'] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

export const LEAD_SOURCES = ['manual', 'csv', 'ny_registry'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** new → working → contacted → replied → registered → paid; lost anywhere. */
export const LEAD_STATUSES = [
  'new',
  'working',
  'contacted',
  'replied',
  'registered',
  'paid',
  'lost',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Statuses the system sets from the referral code; people cannot move a
 * lead back out of them by hand (only the admin's "lost"). */
export const SYSTEM_STATUSES: readonly LeadStatus[] = ['registered', 'paid'];

export const ACTIVITY_KINDS = [
  'call',
  'email',
  'note',
  'status',
  'assign',
  'system',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** What the employee logs after a call. */
export const CALL_OUTCOMES = [
  'no_answer',
  'voicemail',
  'talked',
  'interested',
  'not_interested',
  'callback',
  'wrong_number',
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/** A call outcome moves the lead forward when it is further along. */
export const STATUS_AFTER_CALL: Readonly<
  Record<CallOutcome, LeadStatus | null>
> = {
  no_answer: 'working',
  voicemail: 'contacted',
  talked: 'contacted',
  interested: 'replied',
  not_interested: 'lost',
  callback: 'contacted',
  wrong_number: 'lost',
};

export const TEMPLATE_KINDS = ['any', 'attorney', 'client'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_VARS = [
  'first_name',
  'last_name',
  'company',
  'sender_name',
  'link',
] as const;

export interface OutreachSettings {
  /** Cold emails one employee may send per calendar day (UTC). */
  dailyEmailLimit: number;
  /** "From" display name on cold emails. */
  fromName: string;
  /** CAN-SPAM: the sender's physical postal address, printed in every
   * email. Sending is refused while it is empty. */
  footerAddress: string;
  /** Public https base of this API (e.g. https://api.lawbid.dev): the
   * unsubscribe link in every cold email points here. Sending is refused
   * while it is empty. */
  apiPublicUrl: string;
  /**
   * Owner 2026-10-05 (legal): calls and emails to consumers (kind
   * 'client') fall under the TCPA and the National Do-Not-Call registry
   * ($500–1,500 per call). Off by default: creating/importing client
   * leads and calling/emailing existing ones is refused while false.
   */
  clientLeadsEnabled: boolean;
  /** The owner confirms consumer numbers are scrubbed against the
   * National DNC registry; required before clientLeadsEnabled. */
  dncConfirmed: boolean;
  /** Subscription Account Number of the DNC registry (informational). */
  dncSan: string;
  /** Local hours of the lead's state in which calls are allowed
   * (TCPA: 8:00–21:00; start < end). */
  callHoursStart: number;
  callHoursEnd: number;
  /** Cold emails one lead may receive in total (0 = no cap) and the
   * pause between two of them, in days. */
  maxEmailsPerLead: number;
  emailCooldownDays: number;
  /** Unconverted leads with no activity for this long are deleted by the
   * daily `outreach.retention` job (data minimization). */
  leadRetentionDays: number;
}

export const DEFAULT_OUTREACH_SETTINGS: OutreachSettings = {
  dailyEmailLimit: 50,
  fromName: 'LawBid',
  footerAddress: '',
  apiPublicUrl: '',
  clientLeadsEnabled: false,
  dncConfirmed: false,
  dncSan: '',
  callHoursStart: 8,
  callHoursEnd: 21,
  maxEmailsPerLead: 2,
  emailCooldownDays: 14,
  leadRetentionDays: 365,
};

export const MAX_DAILY_EMAILS = 1000;
export const OUTREACH_TEXT_LIMITS = {
  fromName: 80,
  footerAddress: 300,
  apiPublicUrl: 200,
  dncSan: 40,
  sourceNote: 300,
} as const;
export const OUTREACH_LIMITS = {
  maxEmailsPerLead: 10,
  emailCooldownDays: 365,
  leadRetentionDaysMin: 30,
  leadRetentionDaysMax: 3650,
} as const;

/** Why a lead must not be contacted; stored in do_not_contact_reason. */
export const DO_NOT_CONTACT_REASONS = [
  'manual',
  'not_interested',
  'wrong_number',
  'unsubscribed',
  'suppression',
  'retention',
] as const;
export type DoNotContactReason = (typeof DO_NOT_CONTACT_REASONS)[number];

/** What blocks a call or an email to a lead right now. */
export type ContactBlockReason =
  | 'dnc'
  | 'client_disabled'
  | 'hours'
  | 'unsubscribed'
  | 'email_limit'
  | 'email_cooldown';

function str(v: unknown, max: number, fallback: string): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : fallback;
}
function int(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
    ? v
    : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function parseOutreachSettings(raw: unknown): OutreachSettings {
  const o = (raw ?? {}) as Partial<Record<keyof OutreachSettings, unknown>>;
  const d = DEFAULT_OUTREACH_SETTINGS;
  return {
    dailyEmailLimit: int(
      o.dailyEmailLimit,
      0,
      MAX_DAILY_EMAILS,
      d.dailyEmailLimit,
    ),
    fromName:
      str(o.fromName, OUTREACH_TEXT_LIMITS.fromName, d.fromName) || d.fromName,
    footerAddress: str(
      o.footerAddress,
      OUTREACH_TEXT_LIMITS.footerAddress,
      d.footerAddress,
    ),
    apiPublicUrl: str(
      o.apiPublicUrl,
      OUTREACH_TEXT_LIMITS.apiPublicUrl,
      d.apiPublicUrl,
    ).replace(/\/+$/, ''),
    ...parseComplianceSettings(o),
  };
}

/** The TCPA / DNC part of the settings; clientLeadsEnabled never survives
 * without dncConfirmed, and the call window is reset to the default when
 * start is not before end. */
function parseComplianceSettings(
  o: Partial<Record<keyof OutreachSettings, unknown>>,
): Pick<
  OutreachSettings,
  | 'clientLeadsEnabled'
  | 'dncConfirmed'
  | 'dncSan'
  | 'callHoursStart'
  | 'callHoursEnd'
  | 'maxEmailsPerLead'
  | 'emailCooldownDays'
  | 'leadRetentionDays'
> {
  const d = DEFAULT_OUTREACH_SETTINGS;
  const dncConfirmed = bool(o.dncConfirmed, d.dncConfirmed);
  let callHoursStart = int(o.callHoursStart, 0, 23, d.callHoursStart);
  let callHoursEnd = int(o.callHoursEnd, 1, 24, d.callHoursEnd);
  if (callHoursStart >= callHoursEnd) {
    callHoursStart = d.callHoursStart;
    callHoursEnd = d.callHoursEnd;
  }
  return {
    clientLeadsEnabled:
      dncConfirmed && bool(o.clientLeadsEnabled, d.clientLeadsEnabled),
    dncConfirmed,
    dncSan: str(o.dncSan, OUTREACH_TEXT_LIMITS.dncSan, d.dncSan),
    callHoursStart,
    callHoursEnd,
    maxEmailsPerLead: int(
      o.maxEmailsPerLead,
      0,
      OUTREACH_LIMITS.maxEmailsPerLead,
      d.maxEmailsPerLead,
    ),
    emailCooldownDays: int(
      o.emailCooldownDays,
      0,
      OUTREACH_LIMITS.emailCooldownDays,
      d.emailCooldownDays,
    ),
    leadRetentionDays: int(
      o.leadRetentionDays,
      OUTREACH_LIMITS.leadRetentionDaysMin,
      OUTREACH_LIMITS.leadRetentionDaysMax,
      d.leadRetentionDays,
    ),
  };
}

/** Status order for "only forward" moves; lost is outside the ladder. */
const LADDER: readonly LeadStatus[] = [
  'new',
  'working',
  'contacted',
  'replied',
  'registered',
  'paid',
];
export function statusRank(s: LeadStatus): number {
  return LADDER.indexOf(s);
}
/** The further of two statuses; `lost` wins only when the lead has no
 * system status (a registered lead is never lost by a call outcome). */
export function advance(
  current: LeadStatus,
  next: LeadStatus | null,
): LeadStatus {
  if (!next || next === current) return current;
  if (
    SYSTEM_STATUSES.includes(current) &&
    statusRank(next) <= statusRank(current)
  ) {
    return current;
  }
  if (next === 'lost') return current === 'lost' ? current : 'lost';
  if (current === 'lost') return next;
  return statusRank(next) > statusRank(current) ? next : current;
}

/** Lower-cased, trimmed; null when it is not an address. */
export function normalizeEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s.length < 5 || s.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null;
}

/** Digits only; a 10-digit US number gets the country code. Null when
 * too short or too long for a phone number. */
export function normalizePhone(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  let digits = String(v).replace(/\D/g, '');
  if (digits.length === 10) digits = `1${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** "ny" / "New York" → "NY"; null when unknown. */
export function normalizeState(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  const byName = US_STATES[s.toLowerCase()];
  return byName ?? null;
}

const US_STATES: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
};

/** YYYY-MM-DD in UTC, the key of the daily email budget. */
export function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}
