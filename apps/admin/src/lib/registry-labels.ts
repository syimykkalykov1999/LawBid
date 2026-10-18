/**
 * Owner 2026-10-05 — Russian texts of the state registry adapters and their
 * settings (the server sends the field names and English fallbacks).
 */
export const ADAPTER_RU: Record<string, { label: string; description: string }> = {
  manual: {
    label: 'Вручную',
    description:
      'Без автопроверки. Адвокат одобряется по присяге, админ при жалобе открывает профиль на сайте коллегии.',
  },
  ny_open_data: {
    label: 'Нью-Йорк — data.ny.gov (готовый)',
    description:
      'Официальный открытый реестр адвокатов штата Нью-Йорк. Бесплатно, работает без ключа; токен приложения только поднимает лимит запросов.',
  },
  socrata: {
    label: 'Открытые данные штата (Socrata)',
    description:
      'Если штат публикует список адвокатов на портале открытых данных (data.<штат>.gov): укажите набор данных и названия колонок.',
  },
  generic_rest: {
    label: 'Любой API с ключом',
    description:
      'API коллегии штата или платного сервиса проверки. В адресе подставляются {bar_number}, {state}, {first_name}, {last_name}; ответ читается по путям ниже.',
  },
};

export const FIELD_RU: Record<string, { label: string; help?: string }> = {
  domain: { label: 'Домен портала' },
  datasetId: { label: 'ID набора данных' },
  numberField: { label: 'Колонка с номером лицензии' },
  firstNameField: { label: 'Колонка с именем' },
  lastNameField: { label: 'Колонка с фамилией' },
  statusField: { label: 'Колонка со статусом' },
  admittedField: { label: 'Колонка с датой допуска' },
  activeValues: {
    label: 'Статусы, которые значат «действует»',
    help: 'Через запятую, регистр не важен. Пусто — любая найденная запись считается действующей.',
  },
  profileUrl: { label: 'Ссылка на профиль (необязательно)' },
  urlTemplate: { label: 'Адрес запроса' },
  authType: {
    label: 'Как передавать ключ',
    help: 'header — в заголовке с именем ниже; bearer — Authorization: Bearer <ключ>; query — параметром в адресе; none — без ключа.',
  },
  authName: { label: 'Имя заголовка / параметра' },
  recordPath: {
    label: 'Путь к записи в ответе',
    help: 'Пусто — весь ответ; если это список, берётся первый элемент. Пример: results.0',
  },
  statusPath: { label: 'Путь к статусу', help: 'Ключи через точку, номера элементов списка — числом: data.status' },
  firstNamePath: { label: 'Путь к имени' },
  lastNamePath: { label: 'Путь к фамилии' },
  fullNamePath: { label: 'Путь к полному имени (если нет фамилии отдельно)' },
  admittedPath: { label: 'Путь к дате допуска' },
};

export const RESULT_RU: Record<string, { text: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }> = {
  pass: { text: 'Совпало: лицензия действует', tone: 'success' },
  fail: { text: 'Не подтверждено', tone: 'danger' },
  manual_review: { text: 'Нужна проверка человеком', tone: 'warning' },
  error: { text: 'Ошибка запроса', tone: 'danger' },
};

/** `attorney_licenses.registry_flag` and lookup `reason` codes. */
export const REASON_RU: Record<string, string> = {
  name_mismatch: 'Имя в реестре другое',
  not_found: 'Номер не найден в реестре',
  not_active: 'Лицензия в реестре не действует',
  provider_error: 'Реестр не ответил',
  no_adapter_for_state: 'У штата нет автопроверки',
  // Owner 2026-10-05: trust levels — someone else registered this bar number.
  duplicate_claim: 'Номер уже заявлен другим адвокатом',
  // Owner 2026-10-18: refused by the state's format, sent for manual review.
  format_unusual: 'Номер не по формату штата — проверить вручную',
};
