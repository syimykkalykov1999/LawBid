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
    fields: {
      secretKey: {
        how: 'Developers → API keys → Secret key → Reveal. Начинается с sk_test_ или sk_live_.',
        example: 'sk_test_51Ab…',
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
    fields: {
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
    fields: { apiKey: { how: 'Credentials → API key. Начинается с AIza.', example: 'AIza…' } },
  },

  turn: {
    steps: [
      'Адреса и секрет берутся из настроек вашего TURN-сервера (coturn), строка static-auth-secret.',
      'Новый секрет можно сгенерировать здесь, но тот же секрет нужно записать и на сервер coturn.',
    ],
    links: [],
    fields: {
      urls: { how: 'Через запятую.', example: 'turn:turn.lawbid.dev:3478,turns:turn.lawbid.dev:5349' },
      secret: { how: 'static-auth-secret из coturn, 16+ символов.', generate: 'token' },
      stunUrls: { how: 'Через запятую. Можно оставить пустым.', example: 'stun:stun.l.google.com:19302' },
    },
  },

  persona: {
    steps: ['Откройте app.withpersona.com → API → API Keys → создайте или скопируйте ключ.'],
    links: [{ label: 'Persona', url: 'https://app.withpersona.com/' }],
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
    fields: { appToken: { how: 'Developer Settings → App Token. Можно оставить пустым.' } },
  },

  storage: {
    steps: [
      'На AWS всё заполняется при установке сервера — менять обычно не нужно.',
      'Ключи доступа на AWS оставьте пустыми (используется роль сервера).',
    ],
    links: [{ label: 'Amazon S3', url: 'https://s3.console.aws.amazon.com/s3/buckets' }],
    fields: {
      region: { how: 'Регион бакетов.', example: 'us-east-1' },
      bucketDocuments: { how: 'Имя бакета документов в S3.' },
      bucketMedia: { how: 'Имя бакета медиа в S3.' },
      accessKeyId: { how: 'На AWS оставьте пустым.' },
      secretAccessKey: { how: 'На AWS оставьте пустым.' },
      cdnBaseUrl: { how: 'Адрес CDN для фото и видео. Можно оставить пустым.', example: 'https://media.lawbid.dev' },
    },
  },

  sentry: {
    steps: [
      'sentry.io → Settings → Projects → проект сервера → Client Keys (DSN) → скопируйте DSN в первое поле.',
      'Для приложения и админки создайте отдельные проекты lawbid-mobile (платформа Flutter) и lawbid-admin (платформа Next.js / JavaScript) и вставьте их DSN в свои поля. Пустое поле = отчёты выключены.',
      'Приложение и админка подхватывают DSN сами, при следующем запуске, без перезапуска сервера и без новой сборки.',
    ],
    links: [{ label: 'Sentry', url: 'https://sentry.io/settings/' }],
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
    fields: {
      apiKey: { how: 'Кабинет хостинга → API key (только чтение).' },
      clusterId: { how: 'Из адреса страницы базы в кабинете хостинга.', example: '00000000-0000-0000-0000-000000000000' },
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
