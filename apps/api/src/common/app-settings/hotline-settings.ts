// Owner row 87 (16.11, docs/dev/HOTLINE_PLAN_2026-11-16.md part в): every
// number of the call hotline lives in app_config, so the owner changes it in
// the admin (Настройки) without a release. The master switch is the feature
// flag `hotline` (Флаги → «Горячая линия», default off). 0 = «без предела»
// wherever the label says so (owner rule 11: no limits the owner can't move).

export interface HotlineSettingDef {
  /** `app_config` key (English). */
  key: string;
  default: number;
  /** Technical floor only; ceilings are not set (owner 14.11 «no limits»). */
  min: number;
  max?: number;
  /** Russian label for the admin; the English key is appended there. */
  labelRu: string;
}

export const HOTLINE_SETTING_DEFS: readonly HotlineSettingDef[] = [
  {
    key: 'hotline.offer_timeout_sec',
    default: 10,
    min: 3,
    labelRu:
      'Горячая линия: секунд адвокату на «Взять», потом звонок уходит следующему свободному адвокату',
  },
  {
    key: 'hotline.heartbeat_sec',
    default: 15,
    min: 2,
    labelRu:
      'Горячая линия: как часто открытый раздел линии подтверждает серверу «я здесь», секунд',
  },
  {
    key: 'hotline.presence_ttl_sec',
    default: 45,
    min: 5,
    labelRu:
      'Горячая линия: адвокат без подтверждения столько секунд снят с линии (свернул приложение, пропала связь)',
  },
  {
    key: 'hotline.client_ttl_sec',
    default: 45,
    min: 5,
    labelRu:
      'Горячая линия: клиент без связи столько секунд — его место в очереди снято (кроме тех, кто нажал «Сообщите, когда появится адвокат»)',
  },
  {
    key: 'hotline.queue_max_wait_sec',
    default: 1800,
    min: 0,
    labelRu:
      'Горячая линия: сколько секунд клиент может ждать в очереди, потом заявка закрывается (0 — без предела)',
  },
  {
    key: 'hotline.notify_max_wait_sec',
    default: 86_400,
    min: 0,
    labelRu:
      'Горячая линия: подписка «Сообщите, когда появится адвокат» живёт не дольше, секунд (по умолчанию сутки; 0 — без предела)',
  },
  {
    key: 'hotline.notify_claim_sec',
    default: 60,
    min: 5,
    labelRu:
      'Горячая линия: сколько секунд действует уведомление «Адвокат на линии — позвонить сейчас?»; клиент нажал вовремя — встаёт в очередь со своим прежним временем',
  },
  {
    key: 'hotline.notify_max_attempts',
    default: 3,
    min: 1,
    labelRu:
      'Горячая линия: после стольких уведомлений без ответа подписка закрывается («Мы не дозвонились, оставьте заявку снова»)',
  },
  {
    key: 'hotline.notify_overbook_pct',
    default: 150,
    min: 100,
    labelRu:
      'Горячая линия: сколько ждущих «Сообщите мне» уведомлять на одного свободного адвоката, процентов (150 = 1,5 клиента на адвоката; не меньше 100)',
  },
  {
    key: 'hotline.notify_rate_per_sec',
    default: 200,
    min: 1,
    labelRu:
      'Горячая линия: не больше стольких уведомлений «Адвокат на линии» в секунду на весь сервер',
  },
  {
    key: 'hotline.notify_quiet_start_hour',
    default: 21,
    min: 0,
    max: 23,
    labelRu:
      'Горячая линия: ночью по времени клиента уведомлений «Адвокат на линии» нет с этого часа (0–23; равен концу — ночного окна нет), если клиент сам не разрешил',
  },
  {
    key: 'hotline.notify_quiet_end_hour',
    default: 8,
    min: 0,
    max: 23,
    labelRu:
      'Горячая линия: ночное окно по времени клиента заканчивается в этот час (0–23)',
  },
  {
    key: 'hotline.max_queue_per_bucket',
    default: 500,
    min: 0,
    labelRu:
      'Горячая линия: сколько клиентов ждут в одной очереди «штат × тема × язык», больше — «Сейчас все заняты, попробуйте позже» (0 — без предела)',
  },
  {
    key: 'hotline.max_no_answer',
    default: 3,
    min: 0,
    labelRu:
      'Горячая линия: после стольких пропущенных подряд звонков адвоката снимает с линии (0 — никогда)',
  },
  {
    key: 'hotline.no_answer_pause_sec',
    default: 0,
    min: 0,
    labelRu:
      'Горячая линия: пауза адвоката после пропущенного звонка, секунд, прежде чем придёт следующий (0 — сразу)',
  },
  {
    key: 'hotline.counters_interval_sec',
    default: 5,
    min: 1,
    labelRu:
      'Горячая линия: как часто рассылать табличку «язык · клиентов · адвокатов», секунд (только изменения)',
  },
  {
    key: 'hotline.max_languages',
    default: 3,
    min: 1,
    labelRu: 'Горячая линия: сколько языков клиент выбирает в одной заявке',
  },
  {
    key: 'hotline.topic_max_chars',
    default: 80,
    min: 1,
    labelRu: 'Горячая линия: «О чём звонок» — максимум знаков',
  },
  {
    key: 'hotline.client_requests_per_hour',
    default: 20,
    min: 0,
    labelRu:
      'Горячая линия: заявок от одного клиента в час, больше — отказ (защита от накрутки; 0 — без предела)',
  },
  {
    key: 'hotline.max_buckets_per_attorney',
    default: 2000,
    min: 1,
    labelRu:
      'Горячая линия: сочетаний «штат × тема × язык» у одного адвоката на линии (больше — просим сузить выбор)',
  },
  {
    key: 'hotline.conflict_cache_sec',
    default: 3600,
    min: 0,
    labelRu:
      'Горячая линия: сколько секунд помнить ответ проверки конфликта интересов «адвокат — клиент» (0 — проверять каждый раз)',
  },
  {
    key: 'hotline.sweep_interval_ms',
    default: 1000,
    min: 200,
    labelRu:
      'Горячая линия: как часто сервер снимает просроченные брони, заявки и адвокатов без связи, мс',
  },
  {
    key: 'hotline.call_max_minutes',
    default: 0,
    min: 0,
    labelRu:
      'Горячая линия: предел длины одного звонка с линии, минут (0 — без предела)',
  },
  {
    key: 'hotline.trial_days',
    default: 0,
    min: 0,
    labelRu:
      'Горячая линия: бесплатный пробный срок адвоката, дней с первого включения линии (когда «Бесплатно для всех» выключено; 0 — нет)',
  },
  {
    key: 'hotline.trial_minutes',
    default: 0,
    min: 0,
    labelRu:
      'Горячая линия: бесплатные пробные минуты разговоров адвоката (когда «Бесплатно для всех» выключено; 0 — нет)',
  },
  {
    key: 'hotline.disclosure_version',
    default: 1,
    min: 1,
    labelRu:
      'Горячая линия: версия текстов-предупреждений («Звонки не записываются…»). Текст показывается один раз — при первом звонке; увеличьте число после правки текста, и все увидят его ещё раз',
  },
];

/** Literal (not derived from the list) so `AppSettingKey` stays a union of
 * real keys; hotline-settings.spec.ts checks it matches the list. */
export const OWNER_HOTLINE_SETTINGS = {
  'hotline.offer_timeout_sec': 10,
  'hotline.heartbeat_sec': 15,
  'hotline.presence_ttl_sec': 45,
  'hotline.client_ttl_sec': 45,
  'hotline.queue_max_wait_sec': 1800,
  'hotline.notify_max_wait_sec': 86_400,
  'hotline.notify_claim_sec': 60,
  'hotline.notify_max_attempts': 3,
  'hotline.notify_overbook_pct': 150,
  'hotline.notify_rate_per_sec': 200,
  'hotline.notify_quiet_start_hour': 21,
  'hotline.notify_quiet_end_hour': 8,
  'hotline.max_queue_per_bucket': 500,
  'hotline.max_no_answer': 3,
  'hotline.no_answer_pause_sec': 0,
  'hotline.counters_interval_sec': 5,
  'hotline.max_languages': 3,
  'hotline.topic_max_chars': 80,
  'hotline.client_requests_per_hour': 20,
  'hotline.max_buckets_per_attorney': 2000,
  'hotline.conflict_cache_sec': 3600,
  'hotline.sweep_interval_ms': 1000,
  'hotline.call_max_minutes': 0,
  'hotline.disclosure_version': 1,
  'hotline.trial_days': 0,
  'hotline.trial_minutes': 0,
  /** Owner 16.11 ~19:45: «Бесплатно для всех» overrides every plan while
   * payments are off (on at start). Off = each plan decides (Деньги →
   * Планы): «Входит в тариф» / «Отдельное дополнение $N» / «Недоступно». */
  'hotline.free_for_all_enabled': true,
  /** Owner 16.11 ~19:50: after the one-time disclosure, later calls may show a
   * tiny «Звонки не записываются» line (off by default). */
  'hotline.short_notice_enabled': false,
  /** Owner answers 16.11 (q. 7, 8): a short optional review after the call
   * (like Uber) and «Дальше / Назад» steps for the client before connecting. */
  'hotline.review_enabled': true,
  'hotline.client_steps_enabled': true,
  /** Owner 16.11 ~18:45: clients see bands, never exact counts (like Uber's
   * «cars nearby»): 0 = «нет», below the 2nd band = «есть», then «10+», «50+»… */
  'hotline.counter_bands': [1, 10, 50, 100] as number[],
} as const;

export type HotlineSettingKey = Exclude<
  keyof typeof OWNER_HOTLINE_SETTINGS,
  | 'hotline.free_for_all_enabled'
  | 'hotline.short_notice_enabled'
  | 'hotline.counter_bands'
  | 'hotline.review_enabled'
  | 'hotline.client_steps_enabled'
>;

/** The hotline numbers out of the stored app_config: a missing, non-numeric
 * or below-floor value falls back to the default. One cached read. */
export type HotlineSettings = Record<HotlineSettingKey, number>;

export function hotlineSettingsFrom(
  appConfig: Readonly<Record<string, unknown>>,
): HotlineSettings {
  const out = {} as HotlineSettings;
  for (const d of HOTLINE_SETTING_DEFS) {
    const v = appConfig[d.key];
    const ok =
      typeof v === 'number' &&
      Number.isFinite(v) &&
      v >= d.min &&
      (d.max === undefined || v <= d.max);
    out[d.key as HotlineSettingKey] = ok ? Math.floor(v) : d.default;
  }
  return out;
}

export const DEFAULT_COUNTER_BANDS: readonly number[] = [1, 10, 50, 100];

/** Ascending positive whole numbers; anything else = the default bands. */
export function hotlineCounterBandsFrom(
  appConfig: Readonly<Record<string, unknown>>,
): number[] {
  const v = appConfig['hotline.counter_bands'];
  if (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((x, i) => Number.isInteger(x) && x > 0 && (i === 0 || x > v[i - 1]))
  ) {
    return v as number[];
  }
  return [...DEFAULT_COUNTER_BANDS];
}

/** What a client sees instead of an exact count: 0 → "0", below the second
 * band → "1" («есть»), else the largest band reached as "N+". */
export function bandOf(count: number, bands: readonly number[]): string {
  if (count <= 0) return '0';
  let shown = '1';
  for (let i = 1; i < bands.length; i++) {
    if (count >= bands[i]) shown = `${bands[i]}+`;
  }
  return shown;
}
