/**
 * Owner 2026-10-28: the content checker's rule catalogue. Each rule is a
 * set of patterns for ONE kind of risky claim in attorney-authored ad
 * text. Sources (see docs/runbooks/ATTORNEY_ADS.md): ABA Model Rule 7.1
 * (+ comments [3], [7]), NY RPC 7.1(a)-(c) as amended eff. 2026-06-01
 * (false/misleading standard; "certified specialist" needs a named
 * certifier), NY Rule 7.2 (payment for referrals). Heuristics only: a hit
 * means "a human should look", never a legal conclusion.
 */
export type RuleSeverity = 'high' | 'medium';

export interface AdRule {
  id: string;
  severity: RuleSeverity;
  /** What the owner's ethics lawyer reads. */
  reference: string;
  messageEn: string;
  messageRu: string;
  patterns: RegExp[];
  /** When this matches anywhere in the text the finding is dropped (e.g.
   * a named certifying body). */
  unless?: RegExp;
  /** The text also needs the «prior results» disclaimer. */
  needsResultsDisclaimer?: boolean;
}

export const AD_RULES: readonly AdRule[] = [
  {
    id: 'guarantee',
    severity: 'high',
    reference: 'ABA MR 7.1; NY RPC 7.1(a) (false or misleading communication)',
    messageEn:
      'Promises or guarantees a result. No lawyer can guarantee an outcome.',
    messageRu:
      'Обещание или гарантия результата: юрист не может гарантировать исход.',
    patterns: [
      /\bguarantee[ds]?\b/i,
      /\b100\s?%\s*(success|win|win rate|results?|victory)/i,
      /\bwe\s+(always|never)\s+(win|lose)\b/i,
      /\b(win|victory|result)s?\s+(is|are)\s+guaranteed\b/i,
      /гарантир/i,
      /100\s?%\s*(успех|результат|выигр)/i,
    ],
  },
  {
    id: 'certified_specialist',
    severity: 'high',
    reference:
      'ABA MR 7.1 cmt [14]; NY RPC 7.1(c) as amended 2026-06-01 (a "certified" specialist needs a named certifying organization; formerly NY 7.4)',
    messageEn:
      'Claims board certification / certified specialist without naming the certifying organization.',
    messageRu:
      'Заявлена сертификация специалиста без названия сертифицирующей организации.',
    patterns: [
      /\b(board[- ]?certified|certified\s+(specialist|expert))\b/i,
      /\bсертифицированн\w+\s+(специалист|эксперт)/i,
    ],
    unless:
      /\b(certified|accredited)\s+by\b|\b(NBTA|NBLSC|NELA|ABA[- ]approved)\b/i,
  },
  {
    id: 'specialist_expert',
    severity: 'medium',
    reference:
      'ABA MR 7.1 cmt [7]; NY RPC 7.1 (a "specialist" claim is allowed only if true and not misleading)',
    messageEn:
      'Calls the lawyer a specialist / expert. Allowed only when true (experience, training) and not implied to be certified.',
    messageRu:
      'Слова «специалист/эксперт»: допустимо, только если это правда (опыт, обучение) и без намёка на сертификат.',
    patterns: [
      /\b(specialist|specializes?|specialising|specializing|expert)\b/i,
      /\bэксперт\b|\bспециалист\b/i,
    ],
  },
  {
    id: 'superlative',
    severity: 'medium',
    reference: 'ABA MR 7.1 cmt [3] (unsubstantiated comparison); NY RPC 7.1(a)',
    messageEn:
      '"Best / top / #1" style claim that cannot be verified. Needs factual support or removal.',
    messageRu:
      'Превосходная степень («лучший», «№1»), которую нельзя проверить. Нужно подтверждение или убрать.',
    patterns: [
      /\b(best|top[- ]rated|#\s?1|number\s+one|finest|greatest|premier|unbeatable|unmatched|most\s+successful)\b/i,
      /\bbetter\s+than\s+(other|any|most)\b/i,
      /\bлучш(ий|ая|ие|его)\b|№\s?1\b/i,
    ],
  },
  {
    id: 'past_results',
    severity: 'medium',
    reference:
      'ABA MR 7.1 cmt [3]; NY former 7.1(d)-(e) (results claims carried "Prior results do not guarantee a similar outcome"; no longer mandatory in NY since 2026-06-01, kept as good practice)',
    messageEn:
      'Quotes past results (amounts, wins, verdicts). Add "Prior results do not guarantee a similar outcome."',
    messageRu:
      'Указаны прошлые результаты (суммы, победы). Нужна оговорка «Prior results do not guarantee a similar outcome».',
    needsResultsDisclaimer: true,
    patterns: [
      /\b(recovered|won|obtained|secured|awarded|settlements?|verdicts?)\s+(?:of\s+|over\s+|more than\s+)?\$\s?\d[\d,.]*\s*(k|m|mm|million|billion|thousand)?/i,
      /\$\s?\d[\d,.]*\s*(k|m|mm|million|billion)\s+(settlement|verdict|recovery|win)/i,
      /\b\d{2,3}\s?%\s+(success|win)\s+rate\b/i,
    ],
  },
  {
    id: 'testimonial',
    severity: 'medium',
    reference:
      'ABA MR 7.1 cmt [3]; NY former 7.1(d) (testimonials needed the disclaimer); FTC Endorsement Guides, 16 CFR Part 255',
    messageEn:
      'Looks like a client testimonial / review. Needs real client consent, no cherry-picking, and the results disclaimer.',
    messageRu:
      'Похоже на отзыв клиента. Нужно согласие клиента, без выборочности, и оговорка о результатах.',
    needsResultsDisclaimer: true,
    patterns: [
      /\btestimonials?\b/i,
      /\b(my|our)\s+clients?\s+(say|said|love|recommend)/i,
      /\b(highly\s+recommend|five[- ]star|5[- ]star)\b/i,
      /★{3,}/,
      /["“][^"”]{25,}["”]\s*[-—–]\s*(a\s+)?(former\s+)?(client|customer)/i,
      /\bотзыв(ы)?\s+клиент/i,
    ],
  },
  {
    id: 'referral_payment',
    severity: 'medium',
    reference:
      'ABA MR 7.2(b); NY RPC 7.2(a) (no payment for recommending a lawyer); RPC 5.4(a) (no fee sharing with non-lawyers)',
    messageEn:
      'Offers a reward or fee for sending clients. A lawyer may not pay for referrals or share fees with non-lawyers.',
    messageRu:
      'Предлагает вознаграждение за направление клиентов: юрист не может платить за рекомендации и делить гонорар с не-юристами.',
    patterns: [
      /\b(referral|finder'?s?)\s+(fee|bonus|reward|commission)\b/i,
      /\bsplit\s+(the\s+)?fees?\b/i,
    ],
  },
];

export interface AdFinding {
  ruleId: string;
  severity: RuleSeverity;
  reference: string;
  messageEn: string;
  messageRu: string;
  /** The matched words (≤ 80 chars). */
  excerpt: string;
}

/** Runs the enabled rules over [text]. Pure. */
export function checkAdText(
  text: string,
  disabled: readonly string[] = [],
): AdFinding[] {
  const out: AdFinding[] = [];
  if (!text || !text.trim()) return out;
  for (const rule of AD_RULES) {
    if (disabled.includes(rule.id)) continue;
    if (rule.unless?.test(text)) continue;
    for (const p of rule.patterns) {
      const m = p.exec(text);
      if (!m) continue;
      out.push({
        ruleId: rule.id,
        severity: rule.severity,
        reference: rule.reference,
        messageEn: rule.messageEn,
        messageRu: rule.messageRu,
        excerpt: m[0].slice(0, 80),
      });
      break;
    }
  }
  return out;
}

/** True when the text makes a claim the results disclaimer belongs to. */
export function needsResultsDisclaimer(text: string): boolean {
  return AD_RULES.some(
    (r) => r.needsResultsDisclaimer && r.patterns.some((p) => p.test(text)),
  );
}
