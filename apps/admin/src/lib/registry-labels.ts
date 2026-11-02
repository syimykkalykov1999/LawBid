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
  // Owner 2026-10-28: ready-made settings of the state's official site.
  state_preset: {
    label: 'Готовый: официальный сайт штата',
    description:
      'Готовые настройки для этого штата (проверено 28.10.2026): номер ищется на официальном сайте коллегии или суда штата. Заполнять ничего не нужно. Один запрос на каждую новую лицензию и на вашу перепроверку, ответ хранится 24 часа, не больше 10 запросов в минуту (у некоторых штатов меньше), при ошибках сайта — пауза. Ошибка сайта никогда не блокирует адвоката: лицензия уходит проверяющему.',
  },
  html_page: {
    label: 'Страница коллегии (HTML, своя настройка)',
    description:
      'Публичная страница поиска коллегии, если готового адаптера нет. Значения читаются селекторами: css:<селектор>[@атрибут], label:<подпись>, regex:<шаблон>; две части через « && ». Капчу и вход по логину не обходим.',
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
  // Owner 2026-10-28: POST APIs and public pages.
  method: { label: 'Метод запроса', help: 'GET — адрес с номером; POST — форма или JSON (тело ниже).' },
  bodyType: { label: 'Формат тела POST', help: 'json — JSON; form — как отправляет форма сайта.' },
  bodyTemplate: { label: 'Тело POST', help: 'Подставляются {bar_number}, {state}, {first_name}, {last_name}.' },
  headers: { label: 'Дополнительные заголовки (JSON)', help: 'Например {"X-Requested-With":"XMLHttpRequest"}.' },
  bootstrapUrl: { label: 'Стартовая страница', help: 'Открывается первой: cookie, скрытые поля формы, токен CSRF.' },
  bootstrapHidden: { label: 'Отправлять скрытые поля стартовой страницы', help: 'yes — для форм ASP.NET (__VIEWSTATE).' },
  csrfSelector: { label: 'Где на стартовой странице токен CSRF', help: 'Например css:meta[name=csrf-token]@content' },
  csrfHeader: { label: 'Заголовок для токена CSRF', help: 'Например X-CSRF-TOKEN' },
  numberPath: { label: 'Путь к номеру в записи', help: 'Если ответ — список, берётся запись с тем же номером.' },
  expiresPath: { label: 'Путь к дате «действует до»' },
  numberFormat: { label: 'Номер для сайта', help: 'as_typed — как ввёл адвокат; digits — только цифры.' },
  numberPad: { label: 'Дополнить нулями до N цифр', help: 'Например 5 для ND (08000).' },
  referer: { label: 'Заголовок Referer', help: 'Некоторые сайты открывают запись только «со своей страницы поиска».' },
  detailLinkSelector: { label: 'Ссылка на карточку в результатах', help: 'Если сайт показывает список, а данные — в карточке.' },
  recordSelector: { label: 'Одна запись в результатах (строка / карточка)' },
  numberSelector: { label: 'Номер на странице', help: 'Сверяется с номером адвоката — чужая запись не засчитается.' },
  nameSelector: { label: 'Полное имя' },
  firstNameSelector: { label: 'Имя' },
  lastNameSelector: { label: 'Фамилия' },
  statusSelector: { label: 'Статус лицензии', help: 'Пусто — сайт не публикует статус; найденная запись уходит проверяющему.' },
  admittedSelector: { label: 'Дата допуска' },
  expiresSelector: { label: 'Действует до' },
  firmSelector: { label: 'Фирма' },
  ratePerMin: { label: 'Не больше запросов в минуту', help: 'Вежливое использование сайта штата: по умолчанию 10.' },
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
  // Owner 2026-10-28: the state's roll publishes no license status.
  status_unknown: 'Реестр не публикует статус — проверить вручную',
};
