/**
 * Owner 16.11 ~19:45 / ~19:50: the hotline disclosures (ABA 7.3 client
 * initiates, no recording, no attorney-client relationship until agreed,
 * UPL: licensed in the client's state). Text keys with ru/en drafts the owner
 * will polish; the app shows them where the 13.11 mockups put status text.
 * Shown ONCE per person, role and text version (`hotline.disclosure_version`
 * — bump it after editing a text and everybody sees it once more). Later
 * calls: nothing, or the short line when `hotline.short_notice_enabled`.
 */
export type HotlineRole = 'client' | 'attorney';

export const HOTLINE_DISCLOSURE_TEXTS = {
  'hotline.disclosure.client_wait': {
    ru: 'Звонки не записываются. Мы подбираем адвоката с лицензией в вашем штате. Разговор не делает его вашим адвокатом, пока вы не договоритесь.',
    en: 'Calls are not recorded. We are finding an attorney licensed in your state. The call does not make them your attorney until you both agree.',
  },
  'hotline.disclosure.attorney_offer': {
    ru: 'Звонок не записывается. Клиент из горячей линии LawBid: проверьте конфликт интересов, не давайте гарантий результата, отношения адвокат-клиент — только после вашего согласия.',
    en: 'This call is not recorded. A LawBid hotline client: check for conflicts of interest, promise no outcome; an attorney-client relationship starts only once you agree.',
  },
  'hotline.notice.short': {
    ru: 'Звонки не записываются',
    en: 'Calls are not recorded',
  },
} as const;

export type HotlineTextKey = keyof typeof HOTLINE_DISCLOSURE_TEXTS;

const FULL: Record<HotlineRole, HotlineTextKey> = {
  client: 'hotline.disclosure.client_wait',
  attorney: 'hotline.disclosure.attorney_offer',
};

export interface HotlineDisclosure {
  /** The text key, or null = show nothing. */
  key: HotlineTextKey | null;
  /** full = the one-time disclosure, short = the small line. */
  kind: 'full' | 'short' | null;
  version: number;
  ru: string | null;
  en: string | null;
}

/** The acknowledgement mark: person × role × text version. */
export const ackField = (userId: string, role: HotlineRole, version: number) =>
  `${userId}|${role}|${version}`;

/** What to show on this call: the full text the first time (for this text
 * version), afterwards the short line or nothing. */
export function disclosureFor(
  role: HotlineRole,
  acknowledged: boolean,
  version: number,
  shortNotice: boolean,
): HotlineDisclosure {
  const key: HotlineTextKey | null = !acknowledged
    ? FULL[role]
    : shortNotice
      ? 'hotline.notice.short'
      : null;
  return {
    key,
    kind: key === null ? null : acknowledged ? 'short' : 'full',
    version,
    ru: key ? HOTLINE_DISCLOSURE_TEXTS[key].ru : null,
    en: key ? HOTLINE_DISCLOSURE_TEXTS[key].en : null,
  };
}
