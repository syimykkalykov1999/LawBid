import type { PrismaService } from '../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

/**
 * Owner 2026-10-05 (legal): one app_config row (`legal.settings`, JSON)
 * edited from GET/PUT /admin/legal/settings holds the DMCA agent, the
 * security-incident contact, the repeat-infringer threshold and the short
 * legal texts the app shows (case form, unverified attorney, support,
 * partner disclosure and rules). Missing or malformed fields fall back
 * to the defaults below, field by field (like payments.settings).
 */
export const LEGAL_SETTINGS_KEY = 'legal.settings';

export const LEGAL_LANGS = ['en', 'ru'] as const;
export type LegalLang = (typeof LEGAL_LANGS)[number];

export interface LegalTexts {
  /** Shown under the case description field. */
  caseCreate: string;
  /** Shown for trust level 0 before accepting a bid and in the bid screen. */
  attorneyUnverified: string;
  /** Shown on the new support ticket screen. */
  supportNote: string;
  /** Shown on the partner screen and before joining (FTC disclosure). */
  partnerDisclosure: string;
  /** The partner rules the partner accepts (plain text, no markdown). */
  partnerTerms: string;
}
export type LegalTextsByLang = Record<LegalLang, LegalTexts>;

export const LEGAL_TEXT_LIMITS: Record<keyof LegalTexts, number> = {
  caseCreate: 600,
  attorneyUnverified: 600,
  supportNote: 300,
  partnerDisclosure: 600,
  partnerTerms: 6000,
};

export interface DmcaAgent {
  name: string;
  email: string;
  address: string;
}
export interface IncidentContact {
  email: string;
  phone: string;
}

export interface LegalSettings {
  /** The designated DMCA agent (17 U.S.C. §512(c)(2)); empty until the
   * owner registers one with the Copyright Office — the app then shows a
   * placeholder. */
  dmcaAgent: DmcaAgent;
  /** Who is told about a security incident / data breach. */
  incidentContact: IncidentContact;
  /** DMCA removals after which the author's account is suspended
   * (repeat-infringer policy, §512(i)); 0 = never automatically. */
  dmcaStrikesToSuspend: number;
  texts: LegalTextsByLang;
}

export const DMCA_AGENT_LIMITS = {
  name: 120,
  email: 254,
  address: 300,
} as const;
export const INCIDENT_CONTACT_LIMITS = { email: 254, phone: 40 } as const;
export const MAX_DMCA_STRIKES = 10;

/**
 * Owner 2026-10-05 (legal): the default partner rules. Plain numbered
 * text (no markdown) so the app can show it in a scrollable sheet. The
 * version is PARTNER_TERMS_VERSION in partners.settings.ts; when the
 * owner's lawyer rewrites the rules, bump it there so partners re-accept.
 */
const PARTNER_TERMS_EN = [
  'LawBid partner rules (version 2026-10-05)',
  '1. You are an independent contractor. Nothing here creates employment, agency or a partnership in the legal sense.',
  '2. Disclose the paid relationship clearly in every promotion — every post, video, story or message (for example "#ad" or "partner link"). This is required by the FTC Endorsement Guides (16 CFR Part 255).',
  '3. No spam: no bulk SMS, no cold calls, no messages to people who did not ask to hear from you, no purchased contact lists.',
  '4. No false claims about attorneys, case outcomes or LawBid. Never say an attorney is "verified" or that a result is "guaranteed".',
  '5. No self-referrals, fake accounts or incentives for people to sign up without a real intent to use LawBid.',
  '6. LawBid may hold, reverse or withhold a reward when it suspects fraud or a breach of these rules.',
  '7. Rewards are paid as described in the app. Rates may change for future referrals; earned rewards keep their rate.',
  '8. Taxes on your rewards are your responsibility.',
  '9. A W-9 (or W-8 for non-US persons) is required before the first payout.',
  '10. LawBid may end the partnership at any time; rewards already earned and not reversed are still paid.',
].join('\n');

const PARTNER_TERMS_RU = [
  'Правила партнёра LawBid (версия 2026-10-05)',
  '1. Вы независимый подрядчик. Эти правила не создают трудовых, агентских или партнёрских отношений в юридическом смысле.',
  '2. Ясно сообщайте о платном сотрудничестве в каждой публикации — в каждом посте, видео, сторис или сообщении (например, «#реклама» или «партнёрская ссылка»). Этого требуют правила FTC о рекомендациях (16 CFR Part 255).',
  '3. Без спама: никаких массовых SMS, холодных звонков, сообщений людям, которые вас не просили, и купленных баз контактов.',
  '4. Никаких ложных утверждений об адвокатах, исходах дел или LawBid. Никогда не говорите, что адвокат «проверен» или что результат «гарантирован».',
  '5. Никаких самореферралов, фальшивых аккаунтов и поощрений за регистрацию без реального намерения пользоваться LawBid.',
  '6. LawBid может удержать, отменить или не выплатить вознаграждение при подозрении на мошенничество или нарушение этих правил.',
  '7. Вознаграждение выплачивается так, как описано в приложении. Ставки могут меняться для будущих рефералов; уже заработанное сохраняет свою ставку.',
  '8. Налоги с вознаграждения — ваша ответственность.',
  '9. Перед первой выплатой нужна форма W-9 (или W-8 для лиц не из США).',
  '10. LawBid может прекратить партнёрство в любой момент; уже заработанное и не отменённое вознаграждение выплачивается.',
].join('\n');

export const DEFAULT_LEGAL_TEXTS: LegalTextsByLang = {
  en: {
    caseCreate:
      'LawBid is not a law firm and does not give legal advice. Attorneys who respond are independent. Do not post anything that must stay confidential: share details in the chat with the attorney you choose.',
    attorneyUnverified:
      "This attorney's license is self-declared and has not been checked by LawBid. Verify it with the state bar before you hire (the registry link is in the trust level sheet).",
    supportNote:
      'Our team cannot give legal advice or recommend an attorney. For legal questions, post a case and attorneys will answer.',
    partnerDisclosure:
      'When you tell people about LawBid for a reward you must say so clearly in every post, video or message (for example “#ad” or “partner link”). This is required by the FTC Endorsement Guides.',
    partnerTerms: PARTNER_TERMS_EN,
  },
  ru: {
    caseCreate:
      'LawBid не юридическая фирма и не даёт юридических советов. Адвокаты, которые отвечают, работают независимо. Не публикуйте то, что должно остаться конфиденциальным: подробности сообщайте в чате выбранному адвокату.',
    attorneyUnverified:
      'Лицензия этого адвоката указана им самим и не проверена LawBid. Перед наймом проверьте её в коллегии адвокатов штата (ссылка на реестр — в окне уровня доверия).',
    supportNote:
      'Наша команда не даёт юридических советов и не рекомендует адвокатов. По юридическим вопросам создайте кейс — адвокаты ответят.',
    partnerDisclosure:
      'Если вы рассказываете о LawBid за вознаграждение, ясно сообщайте об этом в каждом посте, видео или сообщении (например, «#реклама» или «партнёрская ссылка»). Этого требуют правила FTC о рекомендациях.',
    partnerTerms: PARTNER_TERMS_RU,
  },
};

export const DEFAULT_LEGAL_SETTINGS: LegalSettings = {
  dmcaAgent: { name: '', email: '', address: '' },
  incidentContact: { email: '', phone: '' },
  dmcaStrikesToSuspend: 3,
  texts: DEFAULT_LEGAL_TEXTS,
};

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
/** A string within the limit (trimmed); empty is allowed for contacts. */
const str = (v: unknown, max: number, d: string): string =>
  typeof v === 'string' && v.trim().length <= max ? v.trim() : d;
/** A non-empty string within the limit, else the default text. */
const textOr = (v: unknown, max: number, d: string): string =>
  typeof v === 'string' && v.trim() !== '' && v.trim().length <= max
    ? v.trim()
    : d;
const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
    ? v
    : null;

export function parseLegalTexts(raw: unknown): LegalTextsByLang {
  const src = obj(raw);
  const out = {} as LegalTextsByLang;
  for (const lang of LEGAL_LANGS) {
    const l = obj(src[lang]);
    const d = DEFAULT_LEGAL_TEXTS[lang];
    const pick = (k: keyof LegalTexts): string =>
      textOr(l[k], LEGAL_TEXT_LIMITS[k], d[k]);
    out[lang] = {
      caseCreate: pick('caseCreate'),
      attorneyUnverified: pick('attorneyUnverified'),
      supportNote: pick('supportNote'),
      partnerDisclosure: pick('partnerDisclosure'),
      partnerTerms: pick('partnerTerms'),
    };
  }
  return out;
}

/** Stored JSON → settings, defaulting every missing / invalid field. */
export function parseLegalSettings(raw: unknown): LegalSettings {
  const d = DEFAULT_LEGAL_SETTINGS;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...d };
  const r = raw as Record<string, unknown>;
  const agent = obj(r.dmcaAgent);
  const incident = obj(r.incidentContact);
  return {
    dmcaAgent: {
      name: str(agent.name, DMCA_AGENT_LIMITS.name, d.dmcaAgent.name),
      email: str(agent.email, DMCA_AGENT_LIMITS.email, d.dmcaAgent.email),
      address: str(
        agent.address,
        DMCA_AGENT_LIMITS.address,
        d.dmcaAgent.address,
      ),
    },
    incidentContact: {
      email: str(
        incident.email,
        INCIDENT_CONTACT_LIMITS.email,
        d.incidentContact.email,
      ),
      phone: str(
        incident.phone,
        INCIDENT_CONTACT_LIMITS.phone,
        d.incidentContact.phone,
      ),
    },
    dmcaStrikesToSuspend:
      int(r.dmcaStrikesToSuspend, 0, MAX_DMCA_STRIKES) ??
      d.dmcaStrikesToSuspend,
    texts: parseLegalTexts(r.texts),
  };
}

/** The user's UI language → the texts language ('ru' → ru, else en). */
export function legalLangOf(uiLanguage: string | null | undefined): LegalLang {
  return uiLanguage === 'ru' ? 'ru' : 'en';
}

/**
 * Reads the settings straight from app_config. Shared by LegalService and
 * PartnersService (which needs the partner disclosure / rules in the
 * user's language) so the partners module does not import LegalModule.
 */
export async function readLegalSettings(
  db: Pick<PrismaService, 'appConfig'> | Prisma.TransactionClient,
): Promise<LegalSettings> {
  const row = await db.appConfig.findUnique({
    where: { key: LEGAL_SETTINGS_KEY },
  });
  return parseLegalSettings(row?.value);
}
