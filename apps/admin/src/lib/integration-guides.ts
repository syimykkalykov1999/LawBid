/**
 * Owner 2026-10-06: "how do I add these keys without you?" — every key
 * card explains, in plain Russian, where each value lives on the vendor's
 * site, which button copies it and what it looks like. Shown in the card
 * («Где взять?») and under each field of the key form. Keyed by provider
 * id / field name from the API (provider-registry); a service without a
 * guide (custom ones) simply shows none.
 */

export interface FieldGuide {
  /** Where to find it: site → menu → button. One or two sentences. */
  how: string;
  /** What a correct value looks like (placeholder). */
  example?: string;
  /** Multi-line value (PEM key): a textarea instead of a one-line input. */
  multiline?: boolean;
  /** «Сгенерировать» fills a fresh random value. */
  generate?: 'token' | 'whsec';
}

export interface ProviderGuide {
  /** Step-by-step, shown under «Где взять?». */
  steps: string[];
  links: { label: string; url: string }[];
  /** Extra word of advice under the steps. */
  note?: string;
  /** «Как включить»: what to do once the values are in, and what switches
   * the service on (owner 2026-10-22: a short block on every card). */
  enable?: string[];
  fields: Record<string, FieldGuide>;
  /** «Загрузить файл .json»: JSON key → field name (filled in the browser). */
  jsonFile?: { button: string; map: Record<string, string> };
  /** Webhook path on the API to paste at the vendor ({field} = that value). */
  webhookPath?: string;
}

export const GUIDES: Record<string, ProviderGuide> = {
  stripe: {
    steps: [
      'Откройте dashboard.stripe.com и войдите.',
      'Сверху справа переключатель «Test mode»: включён — тестовые ключи (sk_test_), выключен — настоящие (sk_live_). Настоящие ключи сервер примет только на AWS.',
      'Секретный ключ: Developers (внизу слева) → API keys → Secret key → Reveal → скопируйте.',
      'Секрет вебхука: Developers → Webhooks → Add endpoint → вставьте адрес ниже → выберите события → Add endpoint → на странице вебхука «Signing secret» → Reveal → скопируйте (whsec_…).',
      'Для оплат клиент → адвокат создайте второй вебхук с «Listen to: Events on Connected accounts» на адрес …/stripe/connect и вставьте его секрет в поле Connect.',
    ],
    links: [
      { label: 'API keys', url: 'https://dashboard.stripe.com/apikeys' },
      { label: 'Webhooks', url: 'https://dashboard.stripe.com/webhooks' },
    ],
    note: 'Пока сервер не на AWS, у вебхука нет адреса: нажмите «Сгенерировать временный» у секрета вебхука, а после переезда на AWS замените его настоящим.',
    webhookPath: '/api/v1/webhooks/stripe',
    enable: [
      'Заполните STRIPE_SECRET_KEY и STRIPE_WEBHOOK_SECRET (остальное необязательно). Вставьте значения → «Добавить ключи» → «Сохранить» → «Проверить» → «Включить».',
      'Платежи работают, как только ключ включён. Нашу страницу оплаты картой включает настройка payments.own_page_enabled (нужен ещё STRIPE_PUBLISHABLE_KEY).',
    ],
    fields: {
      secretKey: {
        how: 'Developers → API keys → Secret key → Reveal. Начинается с sk_test_ или sk_live_.',
        example: 'sk_test_51Ab…',
      },
      publishableKey: {
        how: 'Developers → API keys → Publishable key (pk_…). Нужен для нашей страницы оплаты картой; можно оставить пустым, пока она выключена.',
        example: 'pk_test_51Ab…',
      },
      webhookSecret: {
        how: 'Developers → Webhooks → ваш вебхук → Signing secret → Reveal. Начинается с whsec_. До AWS — «Сгенерировать временный».',
        example: 'whsec_…',
        generate: 'whsec',
      },
      connectWebhookSecret: {
        how: 'Второй вебхук «Events on Connected accounts» → Signing secret. Начинается с whsec_. Можно оставить пустым, пока оплаты адвокатам выключены.',
        example: 'whsec_…',
      },
      priceId: {
        how: 'Можно оставить пустым: цены создаются сами в Деньги → Цены. Иначе Product catalog → товар → цена → ID (price_…).',
        example: 'price_…',
      },
      priceSeatId: { how: 'Можно оставить пустым (Деньги → Цены создаёт цену сама).', example: 'price_…' },
      priceYearlyId: { how: 'Можно оставить пустым (Деньги → Цены создаёт цену сама).', example: 'price_…' },
    },
  },

  bunny_stream: {
    steps: [
      'Откройте dash.bunny.net и войдите.',
      'Слева Stream → нажмите вашу видеобиблиотеку.',
      'Вкладка «API»: там «Video Library ID», «CDN Hostname» и «API Key» — скопируйте по очереди в три первых поля.',
      'Вкладка «Security»: включите «CDN Token Authentication» и скопируйте ключ из этого блока в поле «Ключ защиты CDN-ссылок».',
      'Токен вебхука придумывать не нужно: нажмите «Сгенерировать». После переезда на AWS вставьте в Bunny (вкладка «API» → Webhook URL) адрес ниже.',
    ],
    links: [{ label: 'Bunny Stream', url: 'https://dash.bunny.net/stream' }],
    webhookPath: '/api/v1/webhooks/bunny/{webhookToken}',
    enable: [
      'Заполните BUNNY_LIBRARY_ID, BUNNY_CDN_HOSTNAME, BUNNY_API_KEY, BUNNY_TOKEN_AUTH_KEY и BUNNY_WEBHOOK_TOKEN. Вставьте значения → «Добавить ключи» → «Сохранить» → «Проверить» → «Включить».',
      'Видео и рилсы начинают загружаться сразу после «Включить», без обновления приложения.',
    ],
    fields: {
      accountApiKey: { how: 'Bunny → Account → API Key (ключ аккаунта, не библиотеки). Только для учёта трафика и места, необязательно.' },
      libraryId: { how: 'Stream → библиотека → вкладка API → «Video Library ID». Только цифры.', example: '768949' },
      cdnHostname: {
        how: 'Там же «CDN Hostname». Можно вставить и с https:// — лишнее уберётся само.',
        example: 'vz-abc123.b-cdn.net',
      },
      apiKey: { how: 'Там же «API Key» (ключ библиотеки, не аккаунта).', example: 'a1b2c3d4-…' },
      tokenAuthKey: {
        how: 'Библиотека → вкладка Security → CDN Token Authentication → включите и скопируйте ключ.',
        example: 'a1b2c3d4-…',
      },
      webhookToken: {
        how: 'Любая длинная случайная строка, 24+ символа. Нажмите «Сгенерировать».',
        generate: 'token',
      },
      readOnlyApiKey: {
        how: 'Там же, вкладка «API» → «Read-Only API Key». Необязательно, но лучше заполнить: сервер проверит подпись Bunny (X-BunnyStream-Signature), и чужой запрос с подсмотренным токеном не пройдёт.',
        example: 'a1b2c3d4-…',
      },
    },
  },

  fcm: {
    steps: [
      'Откройте console.firebase.google.com → ваш проект.',
      'Шестерёнка рядом с «Project Overview» → Project settings → вкладка «Service accounts».',
      'Нажмите «Generate new private key» → «Generate key». Скачается файл .json.',
      'Здесь нажмите «Загрузить файл .json» и выберите этот файл — все три поля заполнятся сами. Файл читается прямо в браузере, на сервер уходят только эти три значения.',
    ],
    links: [{ label: 'Firebase Console', url: 'https://console.firebase.google.com/' }],
    note: 'После сохранения удалите скачанный .json с компьютера или храните его в надёжном месте.',
    jsonFile: {
      button: 'Загрузить файл .json',
      map: { project_id: 'projectId', client_email: 'clientEmail', private_key: 'privateKey' },
    },
    enable: [
      'Загрузите .json или вставьте три значения (FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY) → «Сохранить» → «Проверить» → «Включить».',
      'В приложении пуши включаются сами. Для iPhone ещё загрузите ключ APNs в Firebase: Project settings → Cloud Messaging → Apple app configuration → APNs Authentication Key.',
    ],
    fields: {
      projectId: { how: 'Из файла .json: строка "project_id".', example: 'lawbid-6e5ff' },
      clientEmail: {
        how: 'Из файла .json: строка "client_email", заканчивается на .iam.gserviceaccount.com.',
        example: 'firebase-adminsdk-…@….iam.gserviceaccount.com',
      },
      privateKey: {
        how: 'Из файла .json: строка "private_key" целиком, от -----BEGIN до END-----. Подходят и переносы строк, и \\n.',
        example: '-----BEGIN PRIVATE KEY-----…',
        multiline: true,
      },
    },
  },

  twilio: {
    steps: [
      'Откройте console.twilio.com и войдите.',
      'На главной странице блок «Account Info»: Account SID и Auth Token (нажмите «Show» и скопируйте).',
      'Номер: Phone Numbers → Manage → Active numbers.',
      'Messaging service: Messaging → Services → ваш сервис → SID (начинается с MG).',
    ],
    links: [{ label: 'Twilio Console', url: 'https://console.twilio.com/' }],
    enable: [
      'Заполните TWILIO_ACCOUNT_SID и TWILIO_AUTH_TOKEN и укажите отправителя: номер (TWILIO_FROM_NUMBER) или службу сообщений (TWILIO_MESSAGING_SERVICE_SID). Вставьте значения → «Добавить ключи» → «Сохранить» → «Проверить» → «Включить».',
      'Лимиты и страны для SMS — в Настройках (sms.*) и в «Лимитах расходов».',
    ],
    fields: {
      accountSid: { how: 'Главная → Account Info → Account SID. Начинается с AC, 34 символа.', example: 'AC…' },
      authToken: { how: 'Главная → Account Info → Auth Token → Show. 32 символа.' },
      fromNumber: {
        how: 'Phone Numbers → Active numbers. Можно с пробелами и скобками — лишнее уберётся само.',
        example: '+12185516788',
      },
      messagingServiceSid: { how: 'Messaging → Services → SID. Можно оставить пустым.', example: 'MG…' },
      androidAppHash: { how: 'Готовит разработчик при выпуске Android-приложения. Можно оставить пустым.' },
    },
  },

  ses: {
    steps: [
      'Регион, где подтверждён домен в Amazon SES (обычно us-east-1).',
      'Адрес отправителя — на подтверждённом домене, например LawBid <no-reply@lawbid.dev>.',
      'Ключи доступа AWS на сервере в AWS не нужны — оставьте пустыми.',
    ],
    links: [{ label: 'Amazon SES', url: 'https://console.aws.amazon.com/ses/home' }],
    enable: [
      'Заполните SES_REGION и SES_FROM_ADDRESS: почта переключается с «заглушки» на Amazon SES сама, как только оба поля заполнены.',
      'В Amazon SES подтвердите домен или адрес отправителя («Verified identity»). Новый аккаунт Amazon в «песочнице» пишет только на подтверждённые адреса: на странице SES → Account dashboard запросите «Production access».',
      'Вставьте значения → «Добавить ключи» → «Сохранить» → «Проверить» → «Включить».',
    ],
    fields: {
      region: { how: 'AWS → SES → регион сверху справа.', example: 'us-east-1' },
      fromAddress: { how: 'Имя и адрес на вашем домене.', example: 'LawBid <no-reply@lawbid.dev>' },
      accessKeyId: { how: 'На AWS оставьте пустым (используется роль сервера).', example: 'AKIA…' },
      secretAccessKey: { how: 'На AWS оставьте пустым.' },
    },
  },

  google_translate: {
    steps: [
      'Откройте console.cloud.google.com → выберите проект.',
      'APIs & Services → Library → найдите «Cloud Translation API» → Enable.',
      'APIs & Services → Credentials → Create credentials → API key → скопируйте (начинается с AIza).',
      'Нажмите на ключ → API restrictions → «Cloud Translation API» → Save.',
    ],
    links: [{ label: 'Google Cloud Credentials', url: 'https://console.cloud.google.com/apis/credentials' }],
    enable: [
      'Вставьте ключ (GOOGLE_TRANSLATE_API_KEY). Вставьте значения → «Добавить ключи» → «Сохранить» → «Проверить» → «Включить».',
      'Кнопка «Перевести» в чате появится, когда включён и ключ, и флаг «Перевод в чате» (Админка → Флаги).',
    ],
    fields: { apiKey: { how: 'Credentials → API key. Начинается с AIza.', example: 'AIza…' } },
  },

  turn: {
    steps: [
      'Адреса и секрет берутся из настроек вашего TURN-сервера (coturn), строка static-auth-secret.',
      'Новый секрет можно сгенерировать здесь, но тот же секрет нужно записать и на сервер coturn.',
    ],
    links: [],
    enable: [
      'Заполните TURN_URLS и TURN_SECRET (и STUN_URLS, если нужно) → «Сохранить» → «Проверить» → «Включить». Тот же секрет должен стоять на TURN-сервере (coturn).',
      'Видеозвонки включаются отдельно: Админка → Флаги → video_calls (без TURN кнопка видео не работает).',
    ],
    fields: {
      urls: { how: 'Через запятую.', example: 'turn:turn.lawbid.dev:3478,turns:turn.lawbid.dev:5349' },
      secret: { how: 'static-auth-secret из coturn, 16+ символов.', generate: 'token' },
      stunUrls: { how: 'Через запятую. Можно оставить пустым.', example: 'stun:stun.l.google.com:19302' },
    },
  },

  cloudflare_turn: {
    steps: [
      'Cloudflare → Realtime → TURN Server → Create. Дайте ключу имя (например lawbid-calls).',
      'Cloudflare покажет Key ID и API Token (токен виден один раз) — скопируйте оба значения.',
      'Вставьте их в поля ниже → «Сохранить». Наш собственный TURN-сервер остаётся запасным: если Cloudflare не ответит, звонок пойдёт через него.',
      'Цена: оплата за трафик, $0.05 за ГБ; первые 1000 ГБ в месяц бесплатно.',
    ],
    links: [{ label: 'Cloudflare Realtime TURN', url: 'https://developers.cloudflare.com/realtime/turn/' }],
    enable: ['Заполните ID ключа и API-токен → «Сохранить» → «Проверить» → «Включить».'],
    fields: {
      accountId: { how: 'Cloudflare → правый верхний угол «Account ID» (32 символа). Нужен только для учёта трафика звонков.', example: '0123456789abcdef0123456789abcdef' },
      analyticsToken: { how: 'My Profile → API Tokens → Create Token → право «Account Analytics: Read». Только для учёта трафика, необязательно.' },
      keyId: { how: 'Realtime → TURN Server → ваш ключ → Key ID.' },
      apiToken: { how: 'Токен, который Cloudflare показал при создании ключа (один раз).' },
    },
  },

  cloudflare_sfu: {
    steps: [
      'Cloudflare → Realtime → SFU → Create Application. Дайте приложению имя (например lawbid-group-calls).',
      'Cloudflare покажет App ID и App Secret (секрет виден один раз) — скопируйте оба значения.',
      'Вставьте их в поля ниже → «Сохранить» (потребуется код 2FA) → «Проверить»: зелёная отметка значит, что Cloudflare принял ключи.',
      'Включение отдельно: Админка → Настройки → calls.video_provider = cloudflare. Пока ключей нет, система не даст выбрать cloudflare. Сколько человек в звонке — calls.sfu_max_participants (по умолчанию 20).',
      'Если Cloudflare недоступен: звонки до 4 человек идут напрямую между телефонами с видео, а когда людей больше — у всех только аудио (порог — настройка calls.sfu_fallback_mesh_max). Звонок не отклоняется.',
      'Цена: $0.05 за ГБ исходящего трафика Cloudflare; первые 1000 ГБ в месяц бесплатно (общие с Cloudflare TURN). Звонок сквозным шифрованием не закрыт: Cloudflare технически видит медиа.',
    ],
    links: [{ label: 'Cloudflare Realtime SFU', url: 'https://developers.cloudflare.com/realtime/sfu/' }],
    enable: [
      'Заполните App ID и App Secret → «Сохранить» → «Проверить» → «Включить».',
      'Сам ключ звонки не переключает: Админка → Настройки → calls.video_provider = cloudflare.',
    ],
    fields: {
      appId: { how: 'Realtime → SFU → ваше приложение → App ID (32 символа 0-9 a-f).', example: '0123456789abcdef0123456789abcdef' },
      appToken: { how: 'App Secret, который Cloudflare показал при создании приложения (один раз).' },
    },
  },

  pagerduty: {
    steps: [
      'PagerDuty → Services → Service Directory → New Service «LawBid prod» (план Free). Интеграция: Amazon CloudWatch.',
      'Скопируйте Integration URL вида https://events.pagerduty.com/integration/<ключ>/enqueue.',
      'Вставьте в поле ниже → «Сохранить» (код 2FA) → «Проверить» → «Включить». Сервер сам подпишет ссылку на топик lawbid-prod-critical.',
      'Проверка и тестовая тревога: страница «Запуск», пункт PagerDuty (кнопка «Отправить тестовую тревогу» позвонит на телефон — это 1 из 100 бесплатных звонков в месяц).',
    ],
    links: [{ label: 'PagerDuty', url: 'https://www.pagerduty.com' }],
    enable: [
      'Заполните ссылку → «Сохранить» → «Проверить» → «Включить».',
      'Подписка появляется на странице «Запуск»: Pending, затем Confirmed (PagerDuty подтверждает сам).',
    ],
    fields: {
      integrationUrl: {
        how: 'PagerDuty → ваш сервис → Integrations → Amazon CloudWatch → Integration URL. Это секрет: не в чат и не в git.',
        example: 'https://events.pagerduty.com/integration/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/enqueue',
      },
    },
  },

  github: {
    steps: [
      'GitHub → Settings → Developer settings → Fine-grained tokens → Generate. Доступ: только репозиторий LawBid, право Contents: Read-only.',
      'Репозиторий укажите как владелец/имя. Токен нужен только если репозиторий закрытый.',
    ],
    links: [{ label: 'Fine-grained tokens', url: 'https://github.com/settings/personal-access-tokens/new' }],
    enable: ['Заполните → «Сохранить» → «Проверить» → «Включить». Страница «Запуск» начнёт сверять версию с main.'],
    fields: {
      repo: { how: 'Адрес репозитория на GitHub без https://github.com/', example: 'syimykkalykov1999/LawBid' },
      token: { how: 'Fine-grained token с правом только чтения (Contents: Read-only). Пусто — если репозиторий открытый.' },
    },
  },

  turnstile: {
    steps: [
      'Cloudflare → Turnstile → Add widget. Имя: lawbid-web. Домены: lawbid.dev, www.lawbid.dev. Тип: Managed.',
      'Cloudflare покажет Site key (публичный) и Secret key — скопируйте оба.',
      'Вставьте их в поля ниже, домены — через запятую → «Сохранить» (код 2FA) → «Проверить».',
      'Режим включается отдельно: Админка → Настройки → security.turnstile.mode = monitor (только запись в журнал), через неделю — enforce (блокировать ботов).',
      'Работает только на веб-версии. Телефоны защищает App Check. Цена: бесплатно.',
    ],
    links: [{ label: 'Cloudflare Turnstile', url: 'https://developers.cloudflare.com/turnstile/' }],
    enable: [
      'Заполните ключи → «Сохранить» → «Проверить» → «Включить».',
      'Сама карточка ничего не блокирует: режим — в Настройках, security.turnstile.mode.',
    ],
    fields: {
      secretKey: { how: 'Turnstile → ваш виджет → Settings → Secret key.' },
      siteKey: { how: 'Turnstile → ваш виджет → Site key (публичный, попадает в веб-приложение).' },
      hostnames: { how: 'Домены сайта через запятую. Пусто — принимать любой домен.', example: 'lawbid.dev,www.lawbid.dev' },
    },
  },

  livekit: {
    steps: [
      'Поднимите LiveKit: свой сервер (бесплатно, open-source, livekit.io/self-hosting) или аккаунт LiveKit Cloud (cloud.livekit.io) — платный, включайте, когда появится выручка.',
      'LiveKit Cloud: Settings → Keys → Create key. Скопируйте три значения: адрес проекта (wss://…livekit.cloud) — это LIVEKIT_URL, API Key — LIVEKIT_API_KEY, API Secret — LIVEKIT_API_SECRET (секрет показывается один раз).',
      'Свой сервер: адрес wss://ваш-домен, а ключ и секрет — из файла livekit.yaml, раздел keys («ключ: секрет»).',
      'Вставьте три значения в поля ниже и нажмите «Сохранить» (потребуется код 2FA). «Проверка» ничего не включает.',
      'Вебхук: в LiveKit (Settings → Webhooks / параметр webhook в livekit.yaml) добавьте адрес из блока ниже — так LawBid узнаёт, что человек вышел из звонка.',
      'Включение: Админка → Настройки → calls.video_provider = livekit. Пока ключей нет, система не даст выбрать livekit. Звонки до 9 человек отлично работают и без LiveKit (p2p).',
    ],
    links: [
      { label: 'LiveKit Cloud', url: 'https://cloud.livekit.io/' },
      { label: 'Свой сервер', url: 'https://docs.livekit.io/home/self-hosting/deployment/' },
    ],
    webhookPath: '/api/v1/webhooks/livekit',
    enable: [
      'Заполните LIVEKIT_URL, LIVEKIT_API_KEY и LIVEKIT_API_SECRET. Вставьте значения → «Добавить ключи» → «Сохранить» → «Проверить» → «Включить».',
      'Сам ключ звонки не переключает: Админка → Настройки → calls.video_provider = livekit. Старые версии приложения тогда увидят «Обновите приложение».',
    ],
    fields: {
      url: { how: 'LIVEKIT_URL: адрес сервера, начинается с wss://.', example: 'wss://lawbid-abc123.livekit.cloud' },
      apiKey: { how: 'LIVEKIT_API_KEY: LiveKit Cloud → Settings → Keys → API Key.', example: 'APIxxxxxxxx' },
      apiSecret: { how: 'LIVEKIT_API_SECRET: там же, Secret (показывается один раз).', example: 'длинная строка' },
    },
  },

  opensearch: {
    steps: [
      'Это отдельный поисковый движок. Сейчас поиск работает на Postgres и этого не нужно: включайте, когда Postgres станет узким местом (медленный поиск при большом числе пользователей).',
      'Создание: в Terraform (infra/envs/prod/terraform.tfvars) в блоке growth поставьте opensearch_enabled = true и примените. AWS создаст движок сам; адрес появится в выводе growth_opensearch_endpoint (начинается с https://vpc-…).',
      'Вставьте адрес в поле ниже и нажмите «Сохранить» (потребуется код 2FA), затем «Проверить». Имя и пароль нужны только если вы включили закрытый доступ по паролю; по умолчанию доступ только изнутри нашей сети и поля пустые.',
      'Включение шагами: 1) Настройки → search.engine = shadow. Система сама заполнит движок данными (несколько минут) и будет сравнивать ответы, показывая людям результат Postgres. 2) Через пару дней без расхождений в логах поставьте search.engine = engine. 3) Если что-то не так — верните postgres, это мгновенно и ничего не теряет.',
    ],
    links: [{ label: 'Amazon OpenSearch Service', url: 'https://aws.amazon.com/opensearch-service/' }],
    enable: [
      'Заполните адрес → «Добавить ключи» → «Сохранить» → «Проверить» → «Включить».',
      'Сам ключ поиск не переключает: Админка → Настройки → search.engine = shadow, потом engine. Пока адреса нет, система не даст выбрать shadow или engine.',
    ],
    fields: {
      url: { how: 'OPENSEARCH_URL: адрес движка из growth_opensearch_endpoint, с https://.', example: 'https://vpc-lawbid-search-abc123.us-east-1.es.amazonaws.com' },
      username: { how: 'OPENSEARCH_USERNAME: только если у движка включён вход по паролю. Иначе оставьте пустым.' },
      password: { how: 'OPENSEARCH_PASSWORD: пароль к имени выше. Иначе оставьте пустым.' },
      prefix: { how: 'Приставка имён индексов. Оставьте lawbid; для нагрузочной среды — lawbid-loadtest, чтобы среды не смешивались.', example: 'lawbid' },
    },
  },

  persona: {
    steps: ['Откройте app.withpersona.com → API → API Keys → создайте или скопируйте ключ.'],
    links: [{ label: 'Persona', url: 'https://app.withpersona.com/' }],
    enable: [
      'Вставьте ключ (PERSONA_API_KEY) → «Сохранить» → «Проверить»: Persona должна принять ключ. persona_sandbox_… — тестовый, persona_production_… — боевой.',
      'Ключ можно сохранить заранее: он понадобится, когда начнёте проверять личность адвокатов через Persona.',
    ],
    fields: {
      apiKey: { how: 'Начинается с persona_sandbox_ (тест) или persona_production_.', example: 'persona_production_…' },
    },
  },

  google_signin: {
    steps: [
      'console.cloud.google.com → APIs & Services → Credentials.',
      'В блоке «OAuth 2.0 Client IDs» скопируйте Client ID приложений iOS, Android и Web.',
      'Вставьте их через запятую.',
    ],
    links: [{ label: 'Google Cloud Credentials', url: 'https://console.cloud.google.com/apis/credentials' }],
    enable: [
      'В Google Cloud создайте три OAuth-клиента: iOS (Bundle ID com.lawbid.lawbid), Android (имя пакета и SHA-1 подписи приложения) и Web.',
      'Вставьте их Client ID через запятую в GOOGLE_CLIENT_IDS → «Сохранить» → «Проверить» → «Включить».',
      'Пока поле пустое, вход через Google отвечает «способ выключен»: ничего не ломается.',
    ],
    fields: {
      clientIds: {
        how: 'Через запятую, каждый заканчивается на .apps.googleusercontent.com.',
        example: '123-abc.apps.googleusercontent.com',
      },
    },
  },

  apple_signin: {
    steps: [
      'Bundle ID приложения: com.lawbid.lawbid.',
      'Team ID: developer.apple.com → Account → Membership details → Team ID (10 символов).',
    ],
    links: [{ label: 'Apple Developer', url: 'https://developer.apple.com/account' }],
    enable: [
      'На developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → приложение → включите «Sign in with Apple».',
      'Вставьте Bundle ID в APPLE_BUNDLE_IDS (и Team ID в APPLE_TEAM_ID) → «Сохранить» → «Проверить» → «Включить».',
      'Пока поле пустое, вход через Apple отвечает «способ выключен»: ничего не ломается.',
    ],
    fields: {
      bundleIds: { how: 'Через запятую.', example: 'com.lawbid.lawbid' },
      teamId: { how: 'Membership details → Team ID, 10 букв и цифр.', example: 'ABCDE12345' },
    },
  },

  ny_registry: {
    steps: [
      'Работает и без ключа. Ключ только увеличивает лимит проверок.',
      'data.ny.gov → Sign In / Sign Up → Developer Settings → Create New App Token → скопируйте App Token.',
    ],
    links: [{ label: 'data.ny.gov', url: 'https://data.ny.gov/profile/edit/developer_settings' }],
    enable: [
      'Ничего включать не нужно: проверка лицензий Нью-Йорка работает и без ключа.',
      'Ключ (NY_OPEN_DATA_APP_TOKEN) нужен только если проверок станет много и data.ny.gov начнёт отказывать по лимиту.',
    ],
    fields: { appToken: { how: 'Developer Settings → App Token. Можно оставить пустым.' } },
  },

  storage: {
    steps: [
      'На AWS всё заполняется при установке сервера — менять обычно не нужно.',
      'Ключи доступа на AWS оставьте пустыми (используется роль сервера).',
    ],
    links: [{ label: 'Amazon S3', url: 'https://s3.console.aws.amazon.com/s3/buckets' }],
    enable: [
      'На AWS всё заполняется при установке сервера — обычно ничего включать не нужно.',
      'Меняйте поля только при переезде (новые бакеты, регион, CDN). Три поля CloudFront заполняйте все сразу или ни одного.',
      'Вставьте значения → «Добавить ключи» → «Сохранить» → «Проверить» → «Включить».',
    ],
    fields: {
      region: { how: 'Регион бакетов.', example: 'us-east-1' },
      bucketDocuments: { how: 'Имя бакета документов в S3.' },
      bucketMedia: { how: 'Имя бакета медиа в S3.' },
      accessKeyId: { how: 'На AWS оставьте пустым.' },
      secretAccessKey: { how: 'На AWS оставьте пустым.' },
      cdnBaseUrl: { how: 'Адрес CDN для фото и видео. Можно оставить пустым.', example: 'https://media.lawbid.dev' },
      privateCdnDomain: { how: 'Домен CloudFront для приватных файлов (фото и голосовые в чатах, файлы дел, документы). Заполняйте все три поля сразу или ни одного — тогда ссылки подписывает сам S3. Домен и ID ключа показывает `terraform output` (documents_cdn_domain, documents_cdn_key_pair_id).', example: 'd1234abcd.cloudfront.net' },
      privateCdnKeyId: { how: 'ID публичного ключа CloudFront из группы ключей.', example: 'K2JCJMDEHXQW5F' },
      privateCdnPrivateKey: { how: 'Закрытый ключ пары (PEM целиком). Его же можно положить в Secrets Manager как CLOUDFRONT_PRIVATE_KEY_PEM — см. docs/runbooks/DEPLOY_PROD.md.' },
    },
  },

  cloudflare_r2: {
    steps: [
      'Нужен аккаунт Cloudflare. Домен lawbid.dev должен быть добавлен в Cloudflare (смена серверов имён в Namecheap; все текущие DNS-записи перенесите как есть, без оранжевого облака).',
      'Cloudflare → R2 → Create bucket (имя, например, lawbid-public-media; НЕ такое же, как бакеты AWS).',
      'Бакет → Settings → Custom Domains → Connect Domain → media.lawbid.dev. Не включайте r2.dev. В Settings → CORS разрешите PUT с адресов приложения и админки, заголовки Content-Type и Cache-Control.',
      'R2 → Manage API Tokens → Create API token → права «Object Read & Write», только на этот бакет. Скопируйте Access Key ID и Secret Access Key (показывается один раз).',
      'Account ID — справа на странице R2 (или в адресе дашборда).',
      'Необязательно: Cache Purge. Создайте токен с правом Zone → Cache Purge на lawbid.dev и вставьте его вместе с Zone ID — тогда удалённые фото пропадают из кэша сразу, а не через сутки.',
    ],
    links: [
      { label: 'Cloudflare R2', url: 'https://dash.cloudflare.com/?to=/:account/r2/overview' },
      { label: 'API-токены R2', url: 'https://dash.cloudflare.com/?to=/:account/r2/api-tokens' },
    ],
    enable: [
      'Пока ничего не включено — всё работает как раньше (AWS).',
      'Вставьте значения → «Добавить ключи» → «Сохранить» → «Проверить».',
      'Затем Настройки → media.public_store = r2: новые публичные фото пойдут в R2. Старые остаются на AWS и продолжают открываться (их можно перенести скриптом migrate-public-media-to-r2).',
      'Откат: media.public_store = aws. Файлы, уже лежащие в R2, остаются доступными, пока ключи R2 сохранены.',
    ],
    fields: {
      accountId: { how: 'Cloudflare → R2 → Account ID (32 символа).', example: '0123456789abcdef0123456789abcdef' },
      accessKeyId: { how: 'R2 → Manage API Tokens → Create API token → Access Key ID.' },
      secretAccessKey: { how: 'Там же, Secret Access Key. Показывается один раз.' },
      bucket: { how: 'Имя созданного бакета R2. Должно отличаться от бакетов AWS.', example: 'lawbid-public-media' },
      publicBaseUrl: { how: 'Свой домен, подключённый к бакету (Settings → Custom Domains), с https, без пути.', example: 'https://media.lawbid.dev' },
      zoneId: { how: 'Cloudflare → ваш домен → Overview → справа Zone ID. Можно оставить пустым.' },
      purgeToken: { how: 'Токен с правом Zone → Cache Purge на этот домен. Можно оставить пустым.' },
    },
  },

  sentry: {
    steps: [
      'sentry.io → Settings → Projects → проект сервера → Client Keys (DSN) → скопируйте DSN в первое поле.',
      'Для приложения и админки создайте отдельные проекты lawbid-mobile (платформа Flutter) и lawbid-admin (платформа Next.js / JavaScript) и вставьте их DSN в свои поля. Пустое поле = отчёты выключены.',
      'Приложение и админка подхватывают DSN сами, при следующем запуске, без перезапуска сервера и без новой сборки.',
    ],
    links: [{ label: 'Sentry', url: 'https://sentry.io/settings/' }],
    enable: [
      'SENTRY_DSN сервера читается при запуске: после «Сохранить» → «Включить» перезапустите API.',
      'DSN приложения и админки подхватываются сами при следующем запуске — перезапуск и новая сборка не нужны.',
    ],
    fields: {
      dsn: {
        how: 'Client Keys (DSN). Начинается с https:// и заканчивается числом.',
        example: 'https://abc@o123.ingest.sentry.io/456',
      },
      mobileDsn: {
        how: 'DSN проекта lawbid-mobile: Client Keys (DSN). Необязательно.',
        example: 'https://abc@o123.ingest.sentry.io/457',
      },
      adminDsn: {
        how: 'DSN проекта lawbid-admin: Client Keys (DSN). Необязательно.',
        example: 'https://abc@o123.ingest.sentry.io/458',
      },
    },
  },

  cockroach_cloud: {
    steps: [
      'Выберите боевой хостинг PostgreSQL (например, AWS RDS, Neon или Supabase) — проверка бэкапов подключается к его API после выбора.',
      'В кабинете хостинга создайте ключ с ролью «только чтение» и скопируйте его.',
      'ID базы или кластера: он в адресе страницы базы в кабинете хостинга.',
    ],
    links: [],
    enable: [
      'Пока не выбран боевой хостинг PostgreSQL — ничего не заполняйте: проверка свежести бэкапа просто не работает.',
      'После выбора хостинга: ключ «только чтение» (COCKROACH_CLOUD_API_KEY) и ID базы (COCKROACH_CLUSTER_ID) → «Сохранить» → «Проверить» → «Включить».',
    ],
    fields: {
      apiKey: { how: 'Кабинет хостинга → API key (только чтение).' },
      clusterId: { how: 'Из адреса страницы базы в кабинете хостинга.', example: '00000000-0000-0000-0000-000000000000' },
    },
  },

  apns: {
    steps: [
      'Откройте developer.apple.com → Account → Certificates, Identifiers & Profiles → Keys → кнопка «+».',
      'Назовите ключ, отметьте «Apple Push Notifications service (APNs)» → Continue → Register.',
      'Нажмите Download: скачается файл AuthKey_XXXXXXXXXX.p8 (скачать можно только один раз — сохраните его).',
      'Key ID — 10 символов на странице ключа (и в имени файла). Team ID — Account → Membership details.',
      'Откройте .p8 в любом текстовом редакторе и вставьте всё содержимое в последнее поле.',
    ],
    links: [{ label: 'Apple Developer: Keys', url: 'https://developer.apple.com/account/resources/authkeys/list' }],
    enable: [
      'Заполните APNS_KEY_ID, APNS_TEAM_ID и APNS_PRIVATE_KEY → «Сохранить» → «Проверить» → «Включить».',
      'В приложении ничего включать не нужно: входящий звонок начнёт звонить на закрытом iPhone сам.',
    ],
    fields: {
      keyId: { how: 'Страница ключа в Apple Developer → Key ID. 10 заглавных букв и цифр.', example: 'ABC123DEFG' },
      teamId: { how: 'Account → Membership details → Team ID. 10 заглавных букв и цифр.', example: 'ABCDE12345' },
      privateKey: {
        how: 'Содержимое файла .p8 целиком, от -----BEGIN PRIVATE KEY----- до END.',
        example: '-----BEGIN PRIVATE KEY-----…',
        multiline: true,
      },
    },
  },

  aws_rekognition: {
    steps: [
      'На AWS ключи не нужны: сервер использует свою роль. Оставьте поля ключей пустыми.',
      'Регион — тот же, где лежит бакет медиа (например, us-east-1).',
      'Ключи IAM нужны только вне AWS: IAM → Users → пользователь с правом rekognition:DetectModerationLabels → Security credentials → Create access key.',
    ],
    links: [{ label: 'Amazon Rekognition', url: 'https://console.aws.amazon.com/rekognition/home' }],
    enable: [
      'Заполните регион (REKOGNITION_REGION) → «Сохранить» → «Проверить» → «Включить».',
      'Сама проверка фото управляется в Настройках: moderation.image.enabled (вкл/выкл), hide_confidence и review_confidence (пороги).',
    ],
    fields: {
      region: { how: 'Регион бакета медиа.', example: 'us-east-1' },
      accessKeyId: { how: 'На AWS оставьте пустым (роль сервера).', example: 'AKIA…' },
      secretAccessKey: { how: 'На AWS оставьте пустым.' },
    },
  },

  photodna: {
    steps: [
      'Доступ к Microsoft PhotoDNA Cloud Service выдаётся по заявке: подайте её на microsoft.com/photodna (нужен юридический адрес компании).',
      'После одобрения в кабинете PhotoDNA откройте свою подписку и скопируйте ключ (Ocp-Apim-Subscription-Key).',
      'Адрес проверки (Endpoint) оставьте пустым: используется стандартный адрес Microsoft.',
    ],
    links: [{ label: 'Microsoft PhotoDNA', url: 'https://www.microsoft.com/en-us/photodna' }],
    enable: [
      'Вставьте ключ (PHOTODNA_SUBSCRIPTION_KEY) → «Сохранить» → «Проверить» → «Включить».',
      'С этого момента каждое публичное изображение сверяется с базой; совпадение скрывает файл и открывает отчёт для NCMEC (подаётся автоматически, если заполнены поля NCMEC).',
    ],
    fields: {
      subscriptionKey: { how: 'Кабинет PhotoDNA → ваша подписка → Ocp-Apim-Subscription-Key.' },
      endpoint: {
        how: 'Можно оставить пустым (стандартный адрес Microsoft).',
        example: 'https://api.microsoftmoderator.com/photodna/v1.0/Match',
      },
    },
  },

  ncmec: {
    steps: [
      'Зарегистрируйте компанию как Electronic Service Provider (ESP) в NCMEC CyberTipline: report.cybertip.org → «ESP registration».',
      'NCMEC выдаст логин и пароль сначала для тестового режима, после проверки — для боевого.',
      'Режим: сначала test, после проверки и боевых данных — production.',
    ],
    links: [{ label: 'NCMEC CyberTipline', url: 'https://report.cybertip.org/' }],
    enable: [
      'Заполните NCMEC_USERNAME и NCMEC_PASSWORD (режим NCMEC_ENVIRONMENT: test или production) → «Сохранить» → «Проверить» → «Включить».',
      'Пока полей нет, отчёты ждут в Модерация → Медиа с пометкой «подать вручную». Начните с test, затем переключите на production.',
    ],
    fields: {
      username: { how: 'Логин ESP из письма NCMEC.' },
      password: { how: 'Пароль ESP из письма NCMEC.' },
      environment: { how: 'test (пробный) или production (боевой). Пусто = test.', example: 'test' },
    },
  },
};

export function guideFor(provider: string): ProviderGuide | null {
  return GUIDES[provider] ?? null;
}

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** A fresh random value for «Сгенерировать» (browser crypto). */
export function generated(kind: 'token' | 'whsec'): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // 248 = 4 × 62: rejecting the top bytes keeps every character equally likely.
  const body = Array.from(bytes)
    .filter((b) => b < 248)
    .map((b) => ALNUM[b % ALNUM.length])
    .join('')
    .padEnd(28, 'x');
  // Owner 2026-10-06: a placeholder until AWS — "temporary" marks it so
  // nobody mistakes it for the real Stripe secret.
  return kind === 'whsec' ? `whsec_temporary${body}` : body;
}

/** Webhook address to paste at the vendor; best guess from the admin host. */
export function webhookUrl(path: string, values: Record<string, string>): string {
  let origin = 'https://api.lawbid.dev';
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    if (hostname.startsWith('admin.')) origin = `${protocol}//api.${hostname.slice('admin.'.length)}`;
  }
  return origin + path.replace(/\{(\w+)\}/g, (_, k: string) => values[k] || `<${k}>`);
}

/** Plain-Russian reason a key was rejected, for the exact field. */
export function rejectText(label: string, reason: unknown, like?: string | null): string {
  if (reason === 'required') return `Поле «${label}» не заполнено.`;
  if (reason === 'live_not_allowed')
    return 'Настоящие ключи Stripe (sk_live_) сервер принимает только на AWS. Сейчас вставьте тестовый ключ (sk_test_).';
  return `Поле «${label}» заполнено неверно${like ? `. Должно выглядеть так: ${like}` : ''}. Проверьте, что скопировали значение целиком, без лишних слов.`;
}
