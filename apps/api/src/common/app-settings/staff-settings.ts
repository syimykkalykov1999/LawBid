// Staff package T1 (2026-10-27, docs/architecture/ADMIN_STAFF_PACKAGE_PLAN_2026-10-27.md
// part D): every switch and number of «Админка и сотрудники» lives in
// app_config, changed from the admin (Настройки) without a release.
//  - Switches (`staff.*_enabled`) are ALL OFF: with everything off the
//    package does nothing (no queries, no jobs, no new screens).
//  - Numbers start at the research values (plan D2); the admin may change
//    them only inside [min, max] (config-schema.ts checks on save, and
//    StaffSettingsService clamps on read, so a bad stored value cannot
//    break anything).
// The typed reader is modules/staff-core/staff-settings.service.ts.

/** Defaults. A literal object so `AppSettingKey` keeps the exact keys. */
export const OWNER_STAFF_SETTINGS = {
  // --- D1 switches (all OFF) ---
  'staff.workspaces_enabled': false,
  'staff.desk_enabled': false,
  'staff.lease_enabled': false,
  'staff.lease_support_enabled': false,
  'staff.lease_verification_enabled': false,
  'staff.lease_report_enabled': false,
  'staff.lease_appeal_enabled': false,
  'staff.lease_finance_enabled': false,
  'staff.presence_enabled': false,
  'staff.push_offer_enabled': false,
  'staff.rating_enabled': false,
  'staff.suggestions_enabled': false,
  'staff.auto_apply_enabled': false,
  'staff.sampling_enabled': false,
  'staff.golden_enabled': false,
  'staff.peer_check_enabled': false,
  'staff.trust_tiers_enabled': false,
  'staff.head_enabled': false,
  'staff.appeals_enabled': false,
  'staff.case_appeals_enabled': false,
  'staff.piecework_enabled': false,
  'staff.worker_progress_enabled': false,
  'staff.masking_enabled': false,
  'staff.watermark_enabled': false,
  'staff.export_block_enabled': false,
  'staff.session_binding_enforce_enabled': false,
  'staff.anomalies_enabled': false,
  'staff.owner_home_enabled': false,
  'staff.nav_groups_enabled': false,
  'staff.pins_enabled': false,
  'staff.weekly_digest_enabled': false,
  'staff.forecast_enabled': false,
  'staff.ai_enabled': false,
  'staff.ai_qa_enabled': false,
  'staff.ai_hint_enabled': false,
  'staff.ai_summary_enabled': false,
  // --- D2 numbers: rating and quality ---
  'staff.rating.window_days': 30,
  'staff.rating.min_decisions': 30,
  'staff.rating.min_decisions_first_window': 50,
  'staff.rating.min_decisions_finance': 20,
  'staff.rating.weight_accuracy_pct': 50,
  'staff.rating.weight_clean_pct': 25,
  'staff.rating.weight_users_pct': 15,
  'staff.rating.weight_speed_pct': 10,
  'staff.rating.norm': 85,
  'staff.rating.yellow_below': 75,
  'staff.rating.red_below': 60,
  'staff.rating.green_top_pct': 5,
  'staff.rating.yellow_complaints_per_week': 2,
  'staff.rating.red_overturned_in_row': 3,
  'staff.warnings.for_replace': 3,
  'staff.warnings.window_days': 60,
  'staff.sampling.pct': 5,
  'staff.sampling.newcomer_pct': 20,
  'staff.sampling.newcomer_days': 14,
  'staff.golden.pct': 2,
  'staff.peer_check.pct': 2,
  'staff.trust.tier1_sample_pct': 30,
  'staff.trust.tier2_sample_pct': 10,
  'staff.trust.tier3_sample_pct': 5,
  'staff.case_appeal.window_days': 7,
  'staff.case_appeal.max_per_case': 1,
  // --- pay ---
  'staff.piecework.mult_90_pct': 110,
  'staff.piecework.mult_75_pct': 100,
  'staff.piecework.mult_60_pct': 90,
  'staff.piecework.mult_low_pct': 75,
  'staff.piecework.boost_max_pct': 120,
  // --- routing (leases, presence) ---
  'staff.presence.heartbeat_sec': 15,
  'staff.presence.ttl_sec': 45,
  'staff.presence.active_window_sec': 180,
  'staff.presence.grace_sec': 60,
  'staff.lease.idle_release_sec': 300,
  'staff.lease.warn_before_sec': 30,
  'staff.lease.ttl_verification_min': 20,
  'staff.lease.ttl_report_min': 10,
  'staff.lease.ttl_appeal_min': 15,
  'staff.lease.ttl_ticket_min': 30,
  'staff.lease.ttl_finance_min': 10,
  'staff.lease.capacity': 1,
  'staff.lease.chat_capacity': 3,
  'staff.lease.waiting_client_max': 5,
  'staff.lease.wrapup_support_sec': 30,
  'staff.lease.skips_per_hour': 3,
  'staff.offer.ttl_sec': 15,
  'staff.offer.max_rounds': 3,
  'staff.load.red_per_online': 20,
  'staff.reopen.return_after_min': 30,
  // --- head and appeals ---
  'staff.head.max_admins': 50,
  'staff.head.turnover_pct': 15,
  'staff.head.turnover_min_people': 5,
  'staff.head.top_rating': 85,
  'staff.head.top_pct': 20,
  'staff.head.complaints_min': 2,
  'staff.head.complaints_window_days': 60,
  'staff.head.weight_quality_pct': 50,
  'staff.head.weight_turnover_pct': 20,
  'staff.head.weight_complaints_pct': 20,
  'staff.head.weight_speed_pct': 10,
  'staff.retaliation.window_days': 90,
  'staff.retaliation.hold_days': 14,
  'staff.retaliation.ack_days': 7,
  // --- data protection, menu ---
  'staff.reveal_per_day': 20,
  'staff.cards_per_minute': 40,
  'staff.pins_max': 7,
  'staff.anomalies.fast_pct': 20,
  'staff.anomalies.top_n': 20,
  // --- retention of the journals ---
  'staff.retention.signals_days': 120,
  'staff.retention.lease_events_days': 90,
};

export type StaffSettingKey = keyof typeof OWNER_STAFF_SETTINGS;
export type StaffSwitchKey = {
  [K in StaffSettingKey]: (typeof OWNER_STAFF_SETTINGS)[K] extends boolean
    ? K
    : never;
}[StaffSettingKey];
export type StaffNumberKey = Exclude<StaffSettingKey, StaffSwitchKey>;

/** Russian label for the admin (the generic settings editor shows it). */
export const STAFF_SWITCH_LABELS: Readonly<Record<StaffSwitchKey, string>> = {
  'staff.workspaces_enabled':
    'Пространства сотрудников (массовая работа / финансы / владелец): чужие разделы отвечают «не найдено»',
  'staff.desk_enabled': 'Стол сотрудника (/desk) вместо левого меню у рабочих',
  'staff.lease_enabled':
    'Раздача работы «Следующий» с закреплением (один элемент — один человек)',
  'staff.lease_support_enabled': 'Раздача «Следующий»: поддержка',
  'staff.lease_verification_enabled':
    'Раздача «Следующий»: проверка документов',
  'staff.lease_report_enabled': 'Раздача «Следующий»: жалобы и модерация',
  'staff.lease_appeal_enabled': 'Раздача «Следующий»: обжалования',
  'staff.lease_finance_enabled': 'Раздача «Следующий»: возвраты и выплаты',
  'staff.presence_enabled':
    'Сигнал «я на связи» каждые 15 секунд и статусы сотрудников',
  'staff.push_offer_enabled':
    'Предложение живого чата сотруднику на 15 секунд (только чат)',
  'staff.rating_enabled':
    'Ночной рейтинг и флаги сотрудников (только расчёт, без действий)',
  'staff.suggestions_enabled':
    'Показывать предложения системы (предупредить, перепроверка, снять, наградить)',
  'staff.auto_apply_enabled':
    'Автоматически выносить предупреждение (единственное авто-действие; снятие и замена — только человеком)',
  'staff.sampling_enabled': 'Случайная перепроверка решений (после факта)',
  'staff.golden_enabled': 'Эталонные задачи с известным ответом',
  'staff.peer_check_enabled': 'Сверка решений равными (после факта)',
  'staff.trust_tiers_enabled': 'Ступени доверия для новичков',
  'staff.head_enabled': 'Роль «главный пространства»',
  'staff.appeals_enabled':
    'Жалоба на главного (только владельцу) и защита от мести',
  'staff.case_appeals_enabled': 'Сотрудник может оспорить свой случай',
  'staff.piecework_enabled': 'Сдельная оплата в «Зарплаты»',
  'staff.worker_progress_enabled':
    'Сотрудник видит свой рейтинг и причины (только себе)',
  'staff.masking_enabled':
    'Маска телефона и e-mail для массовой работы (раскрытие по кнопке с записью)',
  'staff.watermark_enabled': 'Водяной знак с именем и номером сотрудника',
  'staff.export_block_enabled': 'Запрет выгрузок CSV для сотрудников',
  'staff.session_binding_enforce_enabled':
    'Блокировать вход с нового устройства или страны (выключено = только предупреждение)',
  'staff.anomalies_enabled':
    'Детектор странного поведения сотрудников (отчёт «топ-20»)',
  'staff.owner_home_enabled': 'Страница «Сегодня» для владельца',
  'staff.nav_groups_enabled': 'Новое меню из 8 групп',
  'staff.pins_enabled': 'Закреплённые страницы в меню',
  'staff.weekly_digest_enabled': 'Письмо владельцу «5 чисел» раз в неделю',
  'staff.forecast_enabled': 'Прогноз нагрузки на очереди',
  'staff.ai_enabled':
    'Режим ИИ для сотрудников (мастер-тумблер; выключен — ни одного вызова ИИ)',
  'staff.ai_qa_enabled': 'ИИ: ночная оценка решений (нужен мастер-тумблер)',
  'staff.ai_hint_enabled': 'ИИ: подсказка в столе (нужен мастер-тумблер)',
  'staff.ai_summary_enabled':
    'ИИ: короткое резюме в карточке рекомендации (нужен мастер-тумблер)',
};

export interface StaffNumberDef {
  min: number;
  max: number;
  labelRu: string;
}

/** Bounds (the admin cannot save outside them) + Russian label. */
export const STAFF_NUMBER_DEFS: Readonly<
  Record<StaffNumberKey, StaffNumberDef>
> = {
  'staff.rating.window_days': {
    min: 7,
    max: 90,
    labelRu: 'Рейтинг: окно, дней',
  },
  'staff.rating.min_decisions': {
    min: 10,
    max: 200,
    labelRu: 'Рейтинг: минимум решений за окно (меньше — «мало данных»)',
  },
  'staff.rating.min_decisions_first_window': {
    min: 10,
    max: 200,
    labelRu: 'Рейтинг: минимум решений для первого окна новичка',
  },
  'staff.rating.min_decisions_finance': {
    min: 5,
    max: 200,
    labelRu: 'Рейтинг: минимум решений для финансов',
  },
  'staff.rating.weight_accuracy_pct': {
    min: 0,
    max: 100,
    labelRu: 'Рейтинг: вес точности, %',
  },
  'staff.rating.weight_clean_pct': {
    min: 0,
    max: 100,
    labelRu: 'Рейтинг: вес «без отмен и жалоб», %',
  },
  'staff.rating.weight_users_pct': {
    min: 0,
    max: 100,
    labelRu: 'Рейтинг: вес оценки пользователей, %',
  },
  'staff.rating.weight_speed_pct': {
    min: 0,
    max: 100,
    labelRu: 'Рейтинг: вес скорости и дисциплины, %',
  },
  'staff.rating.norm': { min: 0, max: 100, labelRu: 'Рейтинг: норма' },
  'staff.rating.yellow_below': {
    min: 0,
    max: 100,
    labelRu: 'Рейтинг: жёлтый флаг ниже',
  },
  'staff.rating.red_below': {
    min: 0,
    max: 100,
    labelRu: 'Рейтинг: красный флаг ниже',
  },
  'staff.rating.green_top_pct': {
    min: 1,
    max: 50,
    labelRu: 'Рейтинг: зелёный флаг — лучшие, %',
  },
  'staff.rating.yellow_complaints_per_week': {
    min: 1,
    max: 20,
    labelRu: 'Жёлтый флаг: жалоб за неделю',
  },
  'staff.rating.red_overturned_in_row': {
    min: 1,
    max: 20,
    labelRu: 'Красный флаг: отмен при перепроверке подряд',
  },
  'staff.warnings.for_replace': {
    min: 1,
    max: 20,
    labelRu: 'Предупреждений до предложения «заменить»',
  },
  'staff.warnings.window_days': {
    min: 7,
    max: 365,
    labelRu: 'Окно подсчёта предупреждений, дней',
  },
  'staff.sampling.pct': {
    min: 0,
    max: 50,
    labelRu: 'Перепроверка: доля решений, %',
  },
  'staff.sampling.newcomer_pct': {
    min: 0,
    max: 100,
    labelRu: 'Перепроверка новичков, %',
  },
  'staff.sampling.newcomer_days': {
    min: 0,
    max: 90,
    labelRu: 'Сколько дней человек считается новичком',
  },
  'staff.golden.pct': {
    min: 0,
    max: 10,
    labelRu: 'Эталонные задачи: доля, %',
  },
  'staff.peer_check.pct': {
    min: 0,
    max: 10,
    labelRu: 'Сверка равными: доля, %',
  },
  'staff.trust.tier1_sample_pct': {
    min: 0,
    max: 100,
    labelRu: 'Ступень доверия 1: перепроверка, %',
  },
  'staff.trust.tier2_sample_pct': {
    min: 0,
    max: 100,
    labelRu: 'Ступень доверия 2: перепроверка, %',
  },
  'staff.trust.tier3_sample_pct': {
    min: 0,
    max: 100,
    labelRu: 'Ступень доверия 3: перепроверка, %',
  },
  'staff.case_appeal.window_days': {
    min: 1,
    max: 30,
    labelRu: 'Оспорить свой случай можно в течение, дней',
  },
  'staff.case_appeal.max_per_case': {
    min: 1,
    max: 3,
    labelRu: 'Сколько раз можно оспорить один случай',
  },
  'staff.piecework.mult_90_pct': {
    min: 50,
    max: 200,
    labelRu: 'Сдельная оплата: коэффициент при рейтинге 90+, %',
  },
  'staff.piecework.mult_75_pct': {
    min: 50,
    max: 200,
    labelRu: 'Сдельная оплата: коэффициент при рейтинге 75–89, %',
  },
  'staff.piecework.mult_60_pct': {
    min: 50,
    max: 200,
    labelRu: 'Сдельная оплата: коэффициент при рейтинге 60–74, %',
  },
  'staff.piecework.mult_low_pct': {
    min: 0,
    max: 200,
    labelRu: 'Сдельная оплата: коэффициент при рейтинге ниже 60, %',
  },
  'staff.piecework.boost_max_pct': {
    min: 100,
    max: 200,
    labelRu: 'Сдельная оплата: потолок квеста, % от ставки',
  },
  'staff.presence.heartbeat_sec': {
    min: 5,
    max: 60,
    labelRu: 'Сигнал «я на связи»: раз в, секунд',
  },
  'staff.presence.ttl_sec': {
    min: 15,
    max: 300,
    labelRu: 'Без сигнала дольше — «нет на связи», секунд',
  },
  'staff.presence.active_window_sec': {
    min: 30,
    max: 1800,
    labelRu: 'Без движения дольше — «отошёл», секунд',
  },
  'staff.presence.grace_sec': {
    min: 15,
    max: 600,
    labelRu: 'Льгота на моргание сети, секунд',
  },
  'staff.lease.idle_release_sec': {
    min: 60,
    max: 3600,
    labelRu: 'Нет движения при открытой карточке — элемент уходит, секунд',
  },
  'staff.lease.warn_before_sec': {
    min: 5,
    max: 300,
    labelRu: 'Предупреждение до потери элемента, секунд',
  },
  'staff.lease.ttl_verification_min': {
    min: 1,
    max: 240,
    labelRu: 'Срок закрепления: документ адвоката, минут',
  },
  'staff.lease.ttl_report_min': {
    min: 1,
    max: 240,
    labelRu: 'Срок закрепления: жалоба, минут',
  },
  'staff.lease.ttl_appeal_min': {
    min: 1,
    max: 240,
    labelRu: 'Срок закрепления: обжалование, минут',
  },
  'staff.lease.ttl_ticket_min': {
    min: 1,
    max: 240,
    labelRu: 'Срок закрепления: тикет поддержки, минут',
  },
  'staff.lease.ttl_finance_min': {
    min: 1,
    max: 240,
    labelRu: 'Срок закрепления: финансовая операция, минут',
  },
  'staff.lease.capacity': {
    min: 1,
    max: 10,
    labelRu: 'Элементов в руках одновременно',
  },
  'staff.lease.chat_capacity': {
    min: 1,
    max: 20,
    labelRu: 'Живых чатов одновременно',
  },
  'staff.lease.waiting_client_max': {
    min: 0,
    max: 50,
    labelRu: '«Жду клиента» — до (не считаются в руках)',
  },
  'staff.lease.wrapup_support_sec': {
    min: 0,
    max: 600,
    labelRu: 'Пауза после диалога поддержки, секунд',
  },
  'staff.lease.skips_per_hour': {
    min: 0,
    max: 30,
    labelRu: '«Пропустить» не больше раз в час',
  },
  'staff.offer.ttl_sec': {
    min: 5,
    max: 120,
    labelRu: 'Предложение чата держится, секунд',
  },
  'staff.offer.max_rounds': {
    min: 1,
    max: 10,
    labelRu: 'Кругов предложения до «Свободные» с красной отметкой',
  },
  'staff.load.red_per_online': {
    min: 1,
    max: 1000,
    labelRu: 'Метр нагрузки красный при элементах на онлайн-работника',
  },
  'staff.reopen.return_after_min': {
    min: 1,
    max: 1440,
    labelRu:
      '«Не решено» без других исполнителей возвращается прежнему через, минут',
  },
  'staff.head.max_admins': {
    min: 1,
    max: 2000,
    labelRu: 'Главный: мест в команде',
  },
  'staff.head.turnover_pct': {
    min: 1,
    max: 100,
    labelRu: 'Главный: сигнал при снятии больше % команды за 30 дней',
  },
  'staff.head.turnover_min_people': {
    min: 1,
    max: 1000,
    labelRu: '…и не меньше человек',
  },
  'staff.head.top_rating': {
    min: 0,
    max: 100,
    labelRu: 'Главный: сигнал при снятии сотрудника с рейтингом от',
  },
  'staff.head.top_pct': {
    min: 1,
    max: 100,
    labelRu: 'Главный: сигнал при снятии из лучших, %',
  },
  'staff.head.complaints_min': {
    min: 1,
    max: 50,
    labelRu: 'Главный: сигнал при жалобах от разных людей, не меньше',
  },
  'staff.head.complaints_window_days': {
    min: 7,
    max: 365,
    labelRu: 'Главный: окно подсчёта жалоб, дней',
  },
  'staff.head.weight_quality_pct': {
    min: 0,
    max: 100,
    labelRu: 'Оценка главного: вес качества команды, %',
  },
  'staff.head.weight_turnover_pct': {
    min: 0,
    max: 100,
    labelRu: 'Оценка главного: вес текучки, %',
  },
  'staff.head.weight_complaints_pct': {
    min: 0,
    max: 100,
    labelRu: 'Оценка главного: вес жалоб, %',
  },
  'staff.head.weight_speed_pct': {
    min: 0,
    max: 100,
    labelRu: 'Оценка главного: вес скорости очереди, %',
  },
  'staff.retaliation.window_days': {
    min: 30,
    max: 365,
    labelRu: 'Защита от мести: окно после жалобы, дней',
  },
  'staff.retaliation.hold_days': {
    min: 1,
    max: 90,
    labelRu: 'Защита от мести: «ждёт решения владельца», дней',
  },
  'staff.retaliation.ack_days': {
    min: 1,
    max: 30,
    labelRu: 'Автору жалобы статус «получено / рассмотрено» в течение, дней',
  },
  'staff.reveal_per_day': {
    min: 0,
    max: 500,
    labelRu: 'Раскрытий телефона / e-mail в день на сотрудника',
  },
  'staff.cards_per_minute': {
    min: 5,
    max: 600,
    labelRu: 'Открытий карточек в минуту на сотрудника',
  },
  'staff.pins_max': {
    min: 1,
    max: 20,
    labelRu: 'Закреплённых страниц в меню, не больше',
  },
  'staff.anomalies.fast_pct': {
    min: 1,
    max: 100,
    labelRu: 'Аномалия: решения быстрее, % от медианы группы',
  },
  'staff.anomalies.top_n': {
    min: 5,
    max: 200,
    labelRu: 'Аномалии: строк в суточном отчёте',
  },
  'staff.retention.signals_days': {
    min: 30,
    max: 730,
    labelRu: 'Хранить сигналы качества, дней',
  },
  'staff.retention.lease_events_days': {
    min: 30,
    max: 730,
    labelRu: 'Хранить историю закреплений, дней',
  },
};

export const STAFF_SWITCH_KEYS = Object.keys(
  STAFF_SWITCH_LABELS,
) as StaffSwitchKey[];
export const STAFF_NUMBER_KEYS = Object.keys(
  STAFF_NUMBER_DEFS,
) as StaffNumberKey[];
