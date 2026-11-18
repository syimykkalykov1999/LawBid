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
    default: 25,
    min: 2,
    labelRu:
      'Горячая линия: как часто открытый раздел линии подтверждает серверу «я здесь» по уже открытому сокету, секунд (25 — бережёт батарею; без отдельного опроса)',
  },
  {
    key: 'hotline.presence_ttl_sec',
    default: 60,
    min: 5,
    labelRu:
      'Горячая линия: адвокат без подтверждения столько секунд снят с линии (свернул приложение, пропала связь)',
  },
  {
    key: 'hotline.client_ttl_sec',
    default: 60,
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
    key: 'hotline.call_sync_sec',
    default: 2,
    min: 1,
    labelRu:
      'Горячая линия: как часто сервер сверяет разговор линии с самим звонком (положили трубку на экране звонка, связь не поднялась), секунд',
  },
  {
    key: 'hotline.trial_days',
    default: 0,
    min: 0,
    labelRu:
      'Горячая линия: бесплатный пробный срок адвоката, дней с первого включения линии (режим «По подписке»; 0 — нет)',
  },
  {
    key: 'hotline.trial_minutes',
    default: 0,
    min: 0,
    labelRu:
      'Горячая линия: бесплатные пробные минуты разговоров адвоката (режим «По подписке»; 0 — нет)',
  },
  {
    key: 'hotline.disclosure_version',
    default: 1,
    min: 1,
    labelRu:
      'Горячая линия: версия текстов-предупреждений («Звонки не записываются…»). Текст показывается один раз — при первом звонке; увеличьте число после правки текста, и все увидят его ещё раз',
  },
  {
    key: 'hotline.access_check_beats',
    default: 10,
    min: 0,
    labelRu:
      'Горячая линия: раз во столько сигналов «я здесь» сервер заново проверяет право адвоката быть на линии (выключатель, режим, план, дополнение, пробный срок, лицензия); после каждого звонка — всегда. Нет права — снимает с линии с причиной (0 — только после звонка)',
  },
  {
    key: 'hotline.line_resume_sec',
    default: 43_200,
    min: 0,
    labelRu:
      'Горячая линия: столько секунд сервер помнит выбор адвоката (штаты, темы, языки) после обрыва связи или выкатки, чтобы приложение вернуло его на линию одним запросом (0 — не помнить)',
  },
  {
    key: 'hotline.callback_window_hours',
    default: 168,
    min: 0,
    labelRu:
      'Горячая линия: сколько часов после звонка клиент может сам перезвонить тому же адвокату через линию (адвокат клиенту не звонит никогда; 0 — без предела)',
  },
  {
    key: 'hotline.skip_memory_sec',
    default: 86_400,
    min: 1,
    labelRu:
      'Горячая линия: сколько секунд помнить «Пропустить», пропущенный звонок и конфликт — этому адвокату заявку не предлагать снова',
  },
  {
    key: 'hotline.key_ttl_hours',
    default: 48,
    min: 1,
    labelRu:
      'Горячая линия: сколько часов живут данные одной заявки и адвоката в памяти сервера (не меньше сроков ожидания выше; «без предела» у подписки «Сообщите мне» значит до этого срока)',
  },
  {
    key: 'hotline.sweep_batch',
    default: 500,
    min: 1,
    labelRu:
      'Горячая линия: сколько записей уборщик берёт за один проход из каждого списка (просроченные брони, заявки, адвокаты без связи)',
  },
  {
    key: 'hotline.conflict_cases_max',
    default: 300,
    min: 1,
    labelRu:
      'Горячая линия: сколько последних дел адвоката просматривать при проверке конфликта интересов с клиентом',
  },
  {
    key: 'hotline.poll_cache_sec',
    default: 5,
    min: 0,
    labelRu:
      'Горячая линия: сколько секунд телефон может держать ответ «состояние заявки» и «счётчики» без нового запроса (Cache-Control; 0 — не держать)',
  },
  {
    key: 'hotline.ack_ttl_days',
    default: 365,
    min: 1,
    labelRu:
      'Горячая линия: сколько дней помнить, что человек нажал «Понятно» под предупреждением (потом покажется ещё раз)',
  },
  {
    key: 'hotline.trial_memory_days',
    default: 400,
    min: 1,
    labelRu:
      'Горячая линия: сколько дней без линии помнить пробный срок и минуты адвоката (каждое включение и звонок продлевает)',
  },
];

/** Literal (not derived from the list) so `AppSettingKey` stays a union of
 * real keys; hotline-settings.spec.ts checks it matches the list. */
export const OWNER_HOTLINE_SETTINGS = {
  'hotline.offer_timeout_sec': 10,
  'hotline.heartbeat_sec': 25,
  'hotline.presence_ttl_sec': 60,
  'hotline.client_ttl_sec': 60,
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
  'hotline.call_sync_sec': 2,
  'hotline.disclosure_version': 1,
  'hotline.trial_days': 0,
  'hotline.trial_minutes': 0,
  'hotline.access_check_beats': 10,
  'hotline.line_resume_sec': 43_200,
  'hotline.callback_window_hours': 168,
  'hotline.skip_memory_sec': 86_400,
  'hotline.key_ttl_hours': 48,
  'hotline.sweep_batch': 500,
  'hotline.conflict_cases_max': 300,
  'hotline.poll_cache_sec': 5,
  'hotline.ack_ttl_days': 365,
  'hotline.trial_memory_days': 400,
  /** Owner 16.11 ~19:45 / ~20:05: who may wait for hotline calls — the same
   * three modes as «Вложения в постах» (attachments_in_posts): on_for_all
   * («Вкл для всех», the start while payments are off), by_subscription
   * («По подписке»: each plan in Деньги → Планы — included / add-on $N /
   * unavailable), off_for_all («Выкл для всех»: no attorney). */
  'hotline.mode': 'on_for_all',
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
  /** Audit 17.11 (#8): the offer's «Ещё звонят: N» steps (were in code). */
  'hotline.waiting_more_bands': [1, 2, 5, 10, 50] as number[],
  /** Audit 17.11 (#8): the client's rough place «1 / 2–5 / 6–20 / 20+» —
   * the upper ends of the steps (were in code). */
  'hotline.position_bands': [1, 5, 20] as number[],
  /** Audit 17.11 (#8): the rough wait «до 5 / 5–15 / 15–30 / больше 30
   * минут» — the step ends in minutes (were in code). */
  'hotline.wait_band_minutes': [5, 15, 30] as number[],
} as const;

export type HotlineSettingKey = Exclude<
  keyof typeof OWNER_HOTLINE_SETTINGS,
  | 'hotline.mode'
  | 'hotline.short_notice_enabled'
  | 'hotline.counter_bands'
  | 'hotline.waiting_more_bands'
  | 'hotline.position_bands'
  | 'hotline.wait_band_minutes'
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
  return hotlineBandsFrom(appConfig, 'hotline.counter_bands');
}

/** The band lists of the hotline (audit 17.11 #8: none of them in code). */
export type HotlineBandKey =
  | 'hotline.counter_bands'
  | 'hotline.waiting_more_bands'
  | 'hotline.position_bands'
  | 'hotline.wait_band_minutes';

/** Ascending positive whole numbers; anything else = that list's default. */
export function hotlineBandsFrom(
  appConfig: Readonly<Record<string, unknown>>,
  key: HotlineBandKey,
): number[] {
  const v = appConfig[key];
  if (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((x, i) => Number.isInteger(x) && x > 0 && (i === 0 || x > v[i - 1]))
  ) {
    return v as number[];
  }
  return [...OWNER_HOTLINE_SETTINGS[key]];
}

/** The client's rough place from the 0-based rank: `[1, 5, 20]` →
 * «1», «2-5», «6-20», «20+». */
export function placeBand(rank0: number, ends: readonly number[]): string {
  const p = rank0 + 1;
  let lo = 1;
  for (const hi of ends) {
    if (p <= hi) return lo === hi ? String(hi) : `${lo}-${hi}`;
    lo = hi + 1;
  }
  return `${ends[ends.length - 1]}+`;
}

/** The rough wait from minutes: `[5, 15, 30]` → lt5 · 5to15 · 15to30 · gt30. */
export function minutesBand(minutes: number, ends: readonly number[]): string {
  let lo: number | null = null;
  for (const hi of ends) {
    if (minutes < hi) return lo === null ? `lt${hi}` : `${lo}to${hi}`;
    lo = hi;
  }
  return `gt${ends[ends.length - 1]}`;
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

/** The three modes of the plan builder (attachments_in_posts pattern). */
export const HOTLINE_MODES = [
  'by_subscription',
  'off_for_all',
  'on_for_all',
] as const;
export type HotlineMode = (typeof HOTLINE_MODES)[number];

export function hotlineModeFrom(
  appConfig: Readonly<Record<string, unknown>>,
): HotlineMode {
  const v = appConfig['hotline.mode'];
  return (HOTLINE_MODES as readonly unknown[]).includes(v)
    ? (v as HotlineMode)
    : 'on_for_all';
}
