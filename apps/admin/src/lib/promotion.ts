/**
 * Owner 2026-10-27: texts and small helpers of the «Продвижение» page. The
 * API decides which keys exist and stores the values (apps/api/src/modules/
 * admin-promotion); this file is the plain-Russian side. A test reads the
 * API catalog so both lists stay equal. Channel names are the ENGLISH
 * names the owner sees on the vendor sites.
 */

export interface SwitchChoice {
  value: string;
  label: string;
}

export interface SwitchInfo {
  key: string;
  /** 1-5: the recommended order of turning things on (the runbook). */
  step: number;
  title: string;
  what: string;
  /** Shown in a warning colour before the owner flips it. */
  warn?: string;
  kind: 'bool' | 'int' | 'choice';
  choices?: readonly SwitchChoice[];
  /** For ints: the value that means «no limit» and a sensible start. */
  intZeroText?: string;
  intSuggest?: number;
}

/** In the recommended order. */
export const SWITCHES: readonly SwitchInfo[] = [
  {
    key: 'seo.incremental_enabled',
    step: 2,
    title: 'Публиковать только изменённое',
    what: 'Каждую ночь страницы собираются заново, но на сайт загружаются только те, что изменились, а кэш сбрасывается только для них (не больше 30 адресов в сутки). Дешевле и безопаснее: приложение больше не сбрасывается целиком.',
    kind: 'bool',
  },
  {
    key: 'seo.sitemap_index_enabled',
    step: 3,
    title: 'Карта сайта из нескольких файлов',
    what: 'Адрес /sitemap.xml становится оглавлением, а страницы лежат в нескольких файлах (до 10 000 адресов в каждом). Нужно, когда страниц много.',
    warn: 'После включения один раз заново отправьте https://lawbid.dev/sitemap.xml в Google Search Console и Bing Webmaster Tools (адрес тот же).',
    kind: 'bool',
  },
  {
    key: 'seo.robots_ai_enabled',
    step: 4,
    title: 'Пустить ИИ-поиск, закрыть обучающих ботов',
    what: 'В robots.txt пускаются поисковые боты и боты «по запросу человека» (Google, Bing, ChatGPT, Claude, Perplexity), а боты, которые собирают тексты для обучения моделей, закрываются. Служебные адреса закрыты для всех.',
    kind: 'bool',
  },
  {
    key: 'seo.llms_enabled',
    step: 4,
    title: 'Файл llms.txt для ИИ',
    what: 'Короткий список главных разделов сайта для ИИ-помощников (/llms.txt и /llms-full.txt), без имён адвокатов. Пользы для позиций пока никто не доказал, но почти ничего не стоит.',
    kind: 'bool',
  },
  {
    key: 'seo.quality_gate_enabled',
    step: 5,
    title: 'Закрыть слабые страницы от поиска',
    what: 'Страницы с малым текстом получают метку «не индексировать» и уходят из карты сайта: Google не любит много тонких страниц. Пороги: страница штата или практики от 300 слов, «штат × практика» от 3 адвокатов, профиль от 150 символов о себе.',
    warn: 'Сегодняшние тексты короче порога, поэтому почти все страницы станут «не индексировать», пока тексты не расширят. Сначала сделайте пробный запуск и посмотрите цифры.',
    kind: 'bool',
  },
  {
    key: 'seo.ramp_per_day',
    step: 5,
    title: 'Сколько новых страниц в сутки пускать в поиск',
    what: 'В поиск заходит не больше этого числа НОВЫХ страниц в день, лучшие первыми. Всё, что уже опубликовано, остаётся как есть. Так поисковик не видит внезапных тысяч страниц сразу.',
    kind: 'int',
    intZeroText: '0 = без ограничения',
    intSuggest: 200,
  },
  {
    key: 'seo.generator_mode',
    step: 6,
    title: 'Сборка страниц на нашем сервере',
    what: 'Кто собирает страницы для поиска. По умолчанию выключено: работает только ночная сборка в GitHub. «Раз в ночь» и «Ночью и по событиям» переносят сборку на наш сервер, второй вариант ещё и обновляет страницу через минуту после того, как адвокат опубликован, скрыт или изменил профиль.',
    kind: 'choice',
    choices: [
      { value: 'off', label: 'Выкл' },
      { value: 'nightly', label: 'Раз в ночь' },
      { value: 'nightly+events', label: 'Ночью и по событиям' },
    ],
  },
];

export const switchInfo = (key: string): SwitchInfo | undefined => SWITCHES.find((s) => s.key === key);

/** The recommended order, in words (docs/runbooks/SEO_STATIC_PAGES.md). */
export const ORDER_STEPS: readonly string[] = [
  'Пробный запуск (кнопка ниже): ничего не публикуется, в логе будет план и цифры.',
  'Включите «Публиковать только изменённое». Первый запуск зальёт всё, дальше только изменения.',
  'Включите «Карту сайта из нескольких файлов» и заново отправьте sitemap.xml в Google Search Console и Bing Webmaster Tools.',
  'Включите «Пустить ИИ-поиск» и «Файл llms.txt».',
  'Когда тексты страниц расширены: «Закрыть слабые страницы» и «Сколько новых страниц в сутки» (например 200).',
];

export interface ChannelInfo {
  id: string;
  /** English name as in the vendor's interface. */
  name: string;
  /** What the system does by itself (only what exists or is explicitly planned). */
  system: string;
  /** What the owner clicks, with the vendor's English UI names. */
  owner: readonly string[];
  /** A caution (shown in a warning colour). */
  note?: string;
  href?: string;
}

/** Plan docs/architecture/PSEO_ASO_PACKAGE_PLAN_2026-10-27.md §5. */
export const CHANNELS: readonly ChannelInfo[] = [
  {
    id: 'google_search_console',
    name: 'Google Search Console',
    system: 'Готовит карту сайта (sitemap.xml). Число страниц в индексе система не видит: смотрите в отчёте Google.',
    owner: [
      'Add property → Domain → lawbid.dev.',
      'Добавьте в DNS запись TXT, которую покажет Google (там, где у вас живёт домен).',
      'Sitemaps → вставьте sitemap.xml → Submit.',
      'Для срочного удаления страницы из поиска: Removals.',
    ],
    href: 'https://search.google.com/search-console',
  },
  {
    id: 'bing_webmaster',
    name: 'Bing Webmaster Tools + IndexNow',
    system:
      'Карта сайта и robots.txt готовы. Автоматические пинги IndexNow (сообщить Bing о новой странице за минуты) делаются отдельной задачей пакета и пока не включены.',
    owner: [
      'Add site → Import from Google Search Console (быстрее всего).',
      'Sitemaps → добавьте sitemap.xml.',
      'Включите отчёт AI Performance (сколько раз вас цитирует Copilot), если он доступен в вашем аккаунте.',
    ],
    href: 'https://www.bing.com/webmasters',
  },
  {
    id: 'google_business_profile',
    name: 'Google Business Profile',
    system: 'Подсказывает текст описания.',
    owner: [
      'Для самой площадки профиль почти наверняка не подойдёт: Google не пускает посредников и сервисы подбора юристов. Сначала прочитайте правила Google для вашей категории.',
      'Адвокаты заводят свои профили сами; для них можно разослать памятку (по желанию).',
    ],
    note: 'Не торопитесь: неподходящий профиль могут заблокировать.',
    href: 'https://business.google.com',
  },
  {
    id: 'apple_business_connect',
    name: 'Apple Business Connect',
    system: 'Ничего (это ваш вход с Apple ID).',
    owner: [
      'Войдите с Apple ID и заявите «LawBid» как бизнес (Maps, Siri, Wallet).',
      'Если физического офиса нет, выберите онлайн-бизнес или пропустите пункт.',
    ],
    href: 'https://businessconnect.apple.com',
  },
  {
    id: 'app_store_connect',
    name: 'App Store Connect',
    system: 'Тексты для магазина, ключевые слова и список скриншотов готовятся отдельной задачей пакета (ASO).',
    owner: [
      'Product Page Optimization и Custom Product Pages: проверка разных страниц приложения.',
      'In-App Events: события внутри приложения на странице магазина.',
      'Ratings and Reviews: отвечайте на отзывы.',
      'Вставьте готовые тексты и ключевые слова.',
    ],
    href: 'https://appstoreconnect.apple.com',
  },
  {
    id: 'play_console',
    name: 'Play Console',
    system: 'Тексты и список страниц магазина готовятся отдельной задачей пакета (ASO). Файл assetlinks.json система публикует сама, как только задан ANDROID_APP_SHA256.',
    owner: [
      'Grow users → Store presence → Custom store listings: свои страницы под разные аудитории.',
      'Test and release → App integrity → App signing key certificate: скопируйте SHA-256.',
      'В GitHub (Settings → Secrets and variables → Actions → Variables) положите его в переменную ANDROID_APP_SHA256.',
    ],
    href: 'https://play.google.com/console',
  },
  {
    id: 'lawyer_directories',
    name: 'Justia / Avvo / FindLaw',
    system: 'Готовая карточка компании (название, описание, ссылка).',
    owner: [
      'Это каталоги адвокатов. Для площадки они нужны как упоминание и ссылка на нас, а не для заявок.',
      'Условия размещения у каждого свои: проверяйте при заявке.',
      'Просить ссылку (backlink) можно только честно, без покупки и обмена «ссылка за ссылку».',
    ],
    href: 'https://www.justia.com',
  },
  {
    id: 'yelp_bbb',
    name: 'Yelp / BBB',
    system: 'Готовый текст для страницы компании.',
    owner: [
      'Yelp: создайте страницу бизнеса (Claim your business) и подтвердите владение.',
      'BBB (Better Business Bureau): аккредитация платная, решать вам; бесплатный профиль тоже подойдёт.',
    ],
    href: 'https://biz.yelp.com',
  },
  {
    id: 'reddit_quora',
    name: 'Reddit / Quora / форумы',
    system: 'Список тем и черновики ответов (без публикации). Автопостинга нет и не будет.',
    owner: [
      'Отвечайте вручную, от живого человека, с раскрытием связи с LawBid.',
      'На Reddit не вставляйте ссылку в каждый ответ: за самопродвижение банят.',
    ],
    href: 'https://www.reddit.com',
  },
  {
    id: 'video_social',
    name: 'YouTube / TikTok / Instagram / Facebook',
    system: 'Готовые заголовки, описания и субтитры для коротких видео.',
    owner: [
      'Создайте аккаунты и привяжите их к сайту (ссылки в разметке sameAs).',
      'Публикуйте только своё настоящее видео.',
    ],
    href: 'https://studio.youtube.com',
  },
  {
    id: 'pr_reviews',
    name: 'PR и отзывы',
    system: 'Шаблон письма журналисту и список изданий Нью-Йорка (вручную).',
    owner: [
      'Письма журналистам отправляете вы.',
      'Просите отзывы у реальных клиентов и адвокатов; платные и выдуманные отзывы запрещены.',
    ],
  },
];

export const channelInfo = (id: string): ChannelInfo | undefined => CHANNELS.find((c) => c.id === id);

export const CHECKLIST_PREFIX = 'seo.checklist.';

/** «3 из 11». */
export function progressText(done: number, total: number): string {
  return `${done} из ${total}`;
}

export interface ManifestStatus {
  builtAt: string | null;
  pages: number;
  indexed: number;
  noindex: number;
  rampPerDay: number | null;
  rampDeferred: number | null;
}

const n = (v: number) => v.toLocaleString('ru-RU');

/** «27 октября 2026». */
export function builtAtText(iso: string | null): string {
  if (!iso) return 'неизвестно';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** The status lines under «Состояние»: plain words, only what is known. */
export function statusLines(m: ManifestStatus): { label: string; value: string }[] {
  const lines = [
    { label: 'Последняя сборка', value: builtAtText(m.builtAt) },
    { label: 'Страниц опубликовано', value: n(m.pages) },
    { label: 'Открыто для поиска', value: n(m.indexed) },
    { label: 'Закрыто от поиска (noindex)', value: n(m.noindex) },
  ];
  if (m.rampPerDay !== null && m.rampPerDay > 0) {
    lines.push({ label: 'Новых страниц в сутки', value: n(m.rampPerDay) });
    if (m.rampDeferred !== null) lines.push({ label: 'Ждут своей очереди', value: n(m.rampDeferred) });
  }
  return lines;
}
