/**
 * Owner 2026-10-05 (plan builder): the catalog of everything a plan can
 * include. The KEYS live in code because the checks live in code
 * (EntitlementsService is the only gate — never a scattered constant);
 * the VALUES live in the admin: Деньги → Планы toggles each entitlement
 * per plan, and a baseline plan per audience says what a user with no
 * subscription gets.
 *
 * Types: boolean (on/off), number (a limit; 0 = unlimited where the
 * description says so), price (cents; null = the global price).
 */
export type Audience = 'attorney' | 'client';
export type EntitlementType = 'boolean' | 'number' | 'price';
export type EntitlementValue = boolean | number | null;

export interface EntitlementDef {
  key: EntitlementKey;
  type: EntitlementType;
  audiences: Audience[];
  /** Grouping in the admin editor and the app. */
  group: 'team' | 'cases' | 'visibility' | 'features' | 'billing';
  label: { en: string; ru: string };
  description: { en: string; ru: string };
  min?: number;
  max?: number;
  /** `0` means unlimited (shown as such). */
  zeroIsUnlimited?: boolean;
  /** Not shown in the app's feature lists (billing internals). */
  hidden?: boolean;
}

export const ENTITLEMENT_KEYS = [
  'included_seats',
  'max_seats',
  'extra_seat_price_cents',
  'bids_any_state',
  'max_active_bids',
  'priority_search',
  'calls',
  'video_calls',
  'document_templates',
  'chat_translate',
  'translations_per_day',
  'video_posts',
  'posts_per_day',
  'videos_per_day',
  'case_promotion',
  'platform_payments',
  'trial_days',
  'verified_badge',
  'priority_feed',
  'max_active_cases',
] as const;
export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

export const ENTITLEMENT_CATALOG: readonly EntitlementDef[] = [
  {
    key: 'included_seats',
    type: 'number',
    audiences: ['attorney'],
    group: 'team',
    min: 0,
    max: 50,
    label: { en: 'Assistants included', ru: 'Помощники включены' },
    description: {
      en: 'Assistant seats that come with the plan at no extra charge.',
      ru: 'Места помощников, входящие в цену плана.',
    },
  },
  {
    key: 'max_seats',
    type: 'number',
    audiences: ['attorney'],
    group: 'team',
    min: 0,
    max: 50,
    label: { en: 'Assistants, maximum', ru: 'Помощников максимум' },
    description: {
      en: 'Total seats (included + bought). Equal to "included" = no extra seats can be bought.',
      ru: 'Всего мест (включённые + купленные). Равно «включены» — докупить нельзя.',
    },
  },
  {
    key: 'extra_seat_price_cents',
    type: 'price',
    audiences: ['attorney'],
    group: 'team',
    min: 100,
    max: 1_000_000,
    label: { en: 'Extra assistant, per month', ru: 'Доп. помощник, в месяц' },
    description: {
      en: 'Price of each seat above the included ones. Empty = the global seat price (Prices).',
      ru: 'Цена каждого места сверх включённых. Пусто — общая цена места (Цены).',
    },
  },
  {
    key: 'bids_any_state',
    type: 'boolean',
    audiences: ['attorney'],
    group: 'cases',
    label: { en: 'Offers in any state', ru: 'Предложения в любом штате' },
    description: {
      en: 'Send offers on cases outside the states of a verified licence (the client is told).',
      ru: 'Отклики на дела вне штатов подтверждённой лицензии (клиент это видит).',
    },
  },
  {
    key: 'max_active_bids',
    type: 'number',
    audiences: ['attorney'],
    group: 'cases',
    min: 0,
    max: 1000,
    zeroIsUnlimited: true,
    label: {
      en: 'Active offers at once',
      ru: 'Активных откликов одновременно',
    },
    description: {
      en: 'Open offers an attorney may have at the same time. 0 = unlimited.',
      ru: 'Сколько открытых откликов можно держать одновременно. 0 — без ограничения.',
    },
  },
  {
    key: 'priority_search',
    type: 'boolean',
    audiences: ['attorney'],
    group: 'visibility',
    label: { en: 'Higher in search', ru: 'Выше в поиске' },
    description: {
      en: 'The attorney is ranked above others in people search.',
      ru: 'Адвокат показывается выше других в поиске людей.',
    },
  },
  {
    key: 'calls',
    type: 'boolean',
    audiences: ['attorney', 'client'],
    group: 'features',
    label: { en: 'In-app calls', ru: 'Звонки в приложении' },
    description: {
      en: 'Can start voice calls from a chat once contacts are unlocked.',
      ru: 'Может звонить из чата после открытия контактов.',
    },
  },
  {
    key: 'video_calls',
    type: 'boolean',
    audiences: ['attorney', 'client'],
    group: 'features',
    label: { en: 'Video calls', ru: 'Видеозвонки' },
    description: {
      en: 'Can start video calls from a chat (needs the global video_calls flag and TURN keys).',
      ru: 'Может начать видеозвонок из чата (нужен общий флаг video_calls и ключи TURN).',
    },
  },
  {
    key: 'document_templates',
    type: 'boolean',
    audiences: ['attorney', 'client'],
    group: 'features',
    label: { en: 'Document templates', ru: 'Шаблоны документов' },
    description: {
      en: 'Download templates from the library and attach them to a chat or case (needs the global document_templates flag).',
      ru: 'Скачивать шаблоны из библиотеки и прикреплять их к чату или делу (нужен общий флаг document_templates).',
    },
  },
  {
    key: 'chat_translate',
    type: 'boolean',
    audiences: ['attorney', 'client'],
    group: 'features',
    label: { en: 'Chat translation', ru: 'Перевод сообщений в чате' },
    description: {
      en: 'The translate button on chat messages (the chat_translate flag must be on).',
      ru: 'Кнопка перевода сообщений в чате (нужен включённый флаг chat_translate).',
    },
  },
  {
    key: 'translations_per_day',
    type: 'number',
    audiences: ['attorney', 'client'],
    group: 'features',
    label: { en: 'Translations per day', ru: 'Переводов в день' },
    description: {
      en: 'Daily translation quota; 0 = unlimited; empty = the app default (300).',
      ru: 'Дневная квота переводов; 0 = без ограничения; пусто = как в системе (300).',
    },
    min: 0,
    max: 100_000,
    zeroIsUnlimited: true,
  },
  {
    key: 'video_posts',
    type: 'boolean',
    audiences: ['attorney', 'client'],
    group: 'features',
    label: { en: 'Video posts (reels)', ru: 'Видеопосты (рилсы)' },
    description: {
      en: 'Can upload videos to posts (the video_posts flag must be on).',
      ru: 'Может загружать видео в посты (нужен включённый флаг video_posts).',
    },
  },
  {
    key: 'posts_per_day',
    type: 'number',
    audiences: ['attorney', 'client'],
    group: 'features',
    label: { en: 'Posts per day', ru: 'Постов в день' },
    description: {
      en: 'Daily post limit; 0 = unlimited; empty = the app setting rate_limit.post_create_per_day.',
      ru: 'Лимит постов в день; 0 = без ограничения; пусто = настройка rate_limit.post_create_per_day.',
    },
    min: 0,
    max: 10_000,
    zeroIsUnlimited: true,
  },
  {
    key: 'videos_per_day',
    type: 'number',
    audiences: ['attorney', 'client'],
    group: 'features',
    label: { en: 'Video uploads per day', ru: 'Видео в день' },
    description: {
      en: 'Daily video upload limit; 0 = unlimited; empty = the app setting rate_limit.video_upload_per_day.',
      ru: 'Лимит загрузок видео в день; 0 = без ограничения; пусто = настройка rate_limit.video_upload_per_day.',
    },
    min: 0,
    max: 10_000,
    zeroIsUnlimited: true,
  },
  {
    key: 'case_promotion',
    type: 'boolean',
    audiences: ['client'],
    group: 'features',
    label: { en: 'Case promotion', ru: 'Продвижение кейса' },
    description: {
      en: 'Can buy promotion days for a case.',
      ru: 'Может покупать дни продвижения кейса.',
    },
  },
  {
    key: 'platform_payments',
    type: 'boolean',
    audiences: ['attorney'],
    group: 'billing',
    label: { en: 'Payments through LawBid', ru: 'Приём оплат через LawBid' },
    description: {
      en: 'Clients can pay this attorney inside the app (Stripe Connect; the payments module checks this term).',
      ru: 'Клиенты могут оплачивать услуги адвоката в приложении (Stripe Connect; проверяется модулем платежей).',
    },
  },
  {
    key: 'trial_days',
    type: 'number',
    audiences: ['attorney', 'client'],
    group: 'billing',
    min: 0,
    max: 90,
    label: { en: 'Trial days', ru: 'Пробных дней' },
    description: {
      en: 'Free days for a first purchase of this plan. 0 = no trial.',
      ru: 'Бесплатные дни при первой покупке этого плана. 0 — без триала.',
    },
  },
  {
    key: 'verified_badge',
    type: 'boolean',
    audiences: ['client'],
    group: 'visibility',
    label: { en: 'Verified badge', ru: 'Галочка верификации' },
    description: {
      en: 'The gold badge once the documents are approved — no separate badge payment.',
      ru: 'Золотая галочка после проверки документов — без отдельной оплаты галочки.',
    },
  },
  {
    key: 'priority_feed',
    type: 'boolean',
    audiences: ['client'],
    group: 'visibility',
    label: { en: 'Cases shown first', ru: 'Кейсы показываются первыми' },
    description: {
      en: "The client's open cases go to the top of the attorneys' feed.",
      ru: 'Открытые кейсы клиента — в начале ленты адвокатов.',
    },
  },
  {
    key: 'max_active_cases',
    type: 'number',
    audiences: ['client'],
    group: 'cases',
    min: 0,
    max: 1000,
    zeroIsUnlimited: true,
    label: { en: 'Open cases at once', ru: 'Открытых кейсов одновременно' },
    description: {
      en: 'Open cases a client may have at the same time. 0 = unlimited.',
      ru: 'Сколько открытых кейсов можно держать одновременно. 0 — без ограничения.',
    },
  },
];

export const CATALOG_BY_KEY: ReadonlyMap<EntitlementKey, EntitlementDef> =
  new Map(ENTITLEMENT_CATALOG.map((d) => [d.key, d]));

export function catalogFor(audience: Audience): EntitlementDef[] {
  return ENTITLEMENT_CATALOG.filter((d) => d.audiences.includes(audience));
}

export type Entitlements = Partial<Record<EntitlementKey, EntitlementValue>>;

/**
 * What a user with NO subscription gets until the admin edits the
 * baseline plan of the audience. Mirrors today's behaviour: anyone may
 * call, offers go to any state (owner 2026-10-04), no limits.
 */
export const BASELINE_DEFAULTS: Record<Audience, Entitlements> = {
  attorney: {
    included_seats: 0,
    max_seats: 0,
    extra_seat_price_cents: null,
    bids_any_state: true,
    max_active_bids: 0,
    priority_search: false,
    calls: true,
    video_calls: true,
    // Owner 2026-10-05: templates come with a paid attorney plan.
    document_templates: false,
    chat_translate: true,
    translations_per_day: null,
    video_posts: true,
    posts_per_day: null,
    videos_per_day: null,
    platform_payments: false,
    trial_days: 0,
  },
  client: {
    calls: true,
    video_calls: true,
    // Clients read the public templates for free.
    document_templates: true,
    chat_translate: true,
    translations_per_day: null,
    video_posts: true,
    posts_per_day: null,
    videos_per_day: null,
    case_promotion: true,
    trial_days: 0,
    verified_badge: false,
    priority_feed: false,
    max_active_cases: 0,
  },
};

/** Drop unknown keys and wrong types; clamp numbers to the catalog range. */
export function sanitizeEntitlements(
  audience: Audience,
  input: unknown,
): Entitlements {
  const out: Entitlements = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const def of catalogFor(audience)) {
    const raw = (input as Record<string, unknown>)[def.key];
    if (raw === undefined) continue;
    if (def.type === 'boolean') {
      if (typeof raw === 'boolean') out[def.key] = raw;
      continue;
    }
    if (raw === null) {
      if (def.type === 'price') out[def.key] = null;
      continue;
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    let n = Math.round(raw);
    if (def.min !== undefined) n = Math.max(def.min, n);
    if (def.max !== undefined) n = Math.min(def.max, n);
    out[def.key] = n;
  }
  if (
    typeof out.max_seats === 'number' &&
    typeof out.included_seats === 'number' &&
    out.max_seats < out.included_seats
  ) {
    out.max_seats = out.included_seats;
  }
  return out;
}

/** Baseline defaults ← baseline plan ← the plan / snapshot. */
export function mergeEntitlements(
  audience: Audience,
  ...layers: (Entitlements | null | undefined)[]
): Entitlements {
  const out: Entitlements = { ...BASELINE_DEFAULTS[audience] };
  for (const layer of layers) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (v !== undefined) out[k as EntitlementKey] = v;
    }
  }
  return out;
}

export function entitlementBool(e: Entitlements, key: EntitlementKey): boolean {
  return e[key] === true;
}

export function entitlementNumber(
  e: Entitlements,
  key: EntitlementKey,
): number {
  const v = e[key];
  return typeof v === 'number' ? v : 0;
}
