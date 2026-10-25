/**
 * Russian names for the third-party services and their key fields. The API
 * sends English text (provider-registry); the admin maps it by provider id /
 * field name and falls back to the server text for anything unknown.
 */
const PROVIDER_RU: Record<string, { label: string; description: string; warning?: string }> = {
  bunny_stream: {
    label: 'Bunny Stream (видео)',
    description: 'Видео в постах: загрузка прямо с телефона, обработка, CDN.',
  },
  google_translate: {
    label: 'Google Translate (перевод в чате)',
    description: 'Кнопка «Перевести» под сообщениями в чате. Включите также флаг «Перевод в чате».',
  },
  stripe: { label: 'Stripe (платежи)', description: 'Подписки, оплата, личный кабинет клиента.' },
  twilio: { label: 'Twilio (SMS-коды)', description: 'Коды для входа и подтверждения по SMS.' },
  ses: {
    label: 'Почта (Amazon SES)',
    description: 'Адрес отправителя и регион (доступ к AWS идёт через роль сервера).',
  },
  fcm: { label: 'Firebase Cloud Messaging (пуши)', description: 'Пуш-уведомления на iPhone и Android.' },
  turn: {
    label: 'TURN / STUN (звонки в приложении)',
    description: 'Ретрансляторы для звонков, когда телефоны не могут соединиться напрямую.',
    warning: 'Смените секрет и на TURN-сервере (coturn) одновременно, иначе звонки через TURN перестанут работать.',
  },
  cloudflare_turn: {
    label: 'Cloudflare TURN (звонки в приложении)',
    description:
      'Ретрансляторы Cloudflare для звонков (оплата за трафик, первые 1000 ГБ в месяц бесплатно). Пробуются первыми; наш TURN-сервер остаётся запасным.',
  },
  turnstile: {
    label: 'Cloudflare Turnstile (защита сайта от ботов)',
    description:
      'Проверка «вы не робот» на веб-версии при регистрации и входе по коду. Режим включается в Настройках: security.turnstile.mode (off / monitor / enforce). Телефоны защищает App Check.',
  },
  cloudflare_sfu: {
    label: 'Cloudflare SFU (групповые видеозвонки)',
    description:
      'Cloudflare раздаёт видео участникам группового звонка, телефон отправляет его один раз. Работает только когда в Настройках «calls.video_provider» = cloudflare. Оплата за исходящий трафик, первые 1000 ГБ в месяц бесплатно (общие с TURN). Если Cloudflare недоступен, звонки до 4 человек идут напрямую между телефонами с видео, а больше — только с аудио.',
  },
  livekit: {
    label: 'LiveKit (большие видеозвонки)',
    description:
      'Медиасервер для групповых звонков и звонков каналов. Работает только когда в Настройках «calls.video_provider» = livekit; по умолчанию звонки идут напрямую между телефонами (p2p).',
  },
  persona: { label: 'Persona (проверка личности)', description: 'Проверка личности адвокатов.' },
  google_signin: { label: 'Вход через Google', description: 'OAuth-идентификаторы приложений iOS, Android и веба.' },
  apple_signin: { label: 'Вход через Apple', description: 'Вход через Apple на iPhone (bundle id приложений).' },
  ny_registry: {
    label: 'Реестр адвокатов Нью-Йорка (data.ny.gov)',
    description: 'Автоматическая проверка номеров лицензий Нью-Йорка. Работает без ключа; ключ data.ny.gov только поднимает лимит.',
  },
  bar_lookup: {
    label: 'Проверка лицензий адвокатов',
    description: 'Автоматическая проверка лицензий адвокатов в коллегиях штатов.',
  },
  storage: {
    label: 'Хранилище файлов (Amazon S3 / CDN)',
    description:
      'Фото, документы, голосовые заметки и CDN для медиа. В AWS при пустых ключах используется роль сервера.',
    warning:
      'Если сменить бакеты, файлы из старых бакетов станут недоступны — меняйте только ключи, если файлы не переносили.',
  },
  cloudflare_r2: {
    label: 'Публичные фото (Cloudflare R2)',
    description:
      'Аватары, фото постов и отзывов, стикеры — раздаются из Cloudflare R2 без платы за исходящий трафик. Приватные файлы (чаты, дела, документы, верификация) сюда никогда не попадают и остаются на AWS. Включается настройкой media.public_store = r2.',
    warning:
      'Имя бакета R2 должно отличаться от бакетов AWS. Не меняйте бакет после того, как в нём появились файлы.',
  },
  sentry: { label: 'Sentry (отчёты об ошибках)', description: 'Отчёты о сбоях и ошибках сервера, приложения и админки.' },
  apns: {
    label: 'Apple Push (APNs) — звонки на iPhone',
    description: 'Звонит на iPhone, даже когда приложение закрыто (VoIP-пуши).',
  },
  aws_rekognition: {
    label: 'Проверка фото (AWS Rekognition)',
    description:
      'Смотрит публичные фото, аватары, фото отзывов и обложки рилсов на откровенный и жестокий контент; выше порога файл скрывается и попадает в Модерация → Медиа. На AWS при пустых ключах используется роль сервера.',
  },
  photodna: {
    label: 'PhotoDNA (известные материалы о насилии над детьми)',
    description:
      'Microsoft PhotoDNA: каждое публичное изображение сверяется с базой известных хэшей; совпадение скрывает файл сразу и открывает отчёт в NCMEC.',
  },
  ncmec: {
    label: 'NCMEC CyberTipline (отчёты)',
    description:
      'Аккаунт провайдера (ESP) в NCMEC CyberTipline. Без него отчёты ждут в Модерация → Медиа с пометкой «подать вручную».',
  },
  cockroach_cloud: {
    label: 'Хостинг базы данных (проверка бэкапов)',
    description: 'Ключ только для чтения от хостинга базы данных: сервер каждый час проверяет, что свежий бэкап есть. Подключается после выбора боевого хостинга PostgreSQL.',
  },
};

const FIELD_BY_NAME: Record<string, string> = {
  libraryId: 'ID видеобиблиотеки',
  cdnHostname: 'Адрес CDN',
  apiKey: 'API-ключ',
  tokenAuthKey: 'Ключ защиты CDN-ссылок',
  webhookToken: 'Токен вебхука (любая длинная случайная строка)',
  readOnlyApiKey: 'Read-only API-ключ (проверка подписи вебхука)',
  secretKey: 'Секретный ключ',
  webhookSecret: 'Секрет подписи вебхука',
  connectWebhookSecret: 'Секрет вебхука Connect (оплаты клиент → адвокат)',
  appToken: 'Токен приложения',
  priceId: 'ID цены (месяц)',
  priceSeatId: 'ID цены места помощника',
  priceYearlyId: 'ID цены (год, Prime)',
  accountSid: 'SID аккаунта',
  authToken: 'Токен авторизации',
  fromNumber: 'Номер отправителя',
  messagingServiceSid: 'SID службы сообщений',
  androidAppHash: 'Хэш автоподстановки SMS на Android',
  region: 'Регион',
  fromAddress: 'Адрес отправителя',
  accessKeyId: 'ID ключа доступа AWS',
  secretAccessKey: 'Секретный ключ доступа AWS',
  projectId: 'ID проекта',
  clientEmail: 'Email сервисного аккаунта',
  privateKey: 'Приватный ключ (PEM)',
  urls: 'Адреса TURN (через запятую)',
  secret: 'Общий секрет',
  stunUrls: 'Адреса STUN (через запятую)',
  clientIds: 'ID клиентов OAuth (через запятую)',
  bundleIds: 'ID приложений (через запятую)',
  teamId: 'ID команды Apple',
  bucketDocuments: 'Бакет документов',
  bucketMedia: 'Бакет медиа',
  cdnBaseUrl: 'Базовый адрес CDN для медиа',
  privateCdnDomain: 'Домен CloudFront для приватных файлов',
  privateCdnKeyId: 'ID публичного ключа CloudFront',
  privateCdnPrivateKey: 'Закрытый ключ подписи CloudFront (PEM)',
  dsn: 'Адрес для отчётов',
  publishableKey: 'Публичный ключ',
  keyId: 'ID ключа',
  subscriptionKey: 'Ключ подписки',
  endpoint: 'Адрес проверки',
  username: 'Логин',
  password: 'Пароль',
  environment: 'Режим (test или production)',
};

const FIELD_BY_PROVIDER: Record<string, string> = {
  'cloudflare_r2.accountId': 'ID аккаунта Cloudflare',
  'cloudflare_r2.accessKeyId': 'ID ключа доступа R2',
  'cloudflare_r2.secretAccessKey': 'Секретный ключ доступа R2',
  'cloudflare_r2.bucket': 'Имя бакета R2',
  'cloudflare_r2.publicBaseUrl': 'Публичный адрес (свой домен бакета)',
  'cloudflare_r2.zoneId': 'ID зоны (необязательно, сброс кэша при удалении)',
  'cloudflare_r2.purgeToken': 'API-токен только на сброс кэша (необязательно)',
  'cloudflare_turn.keyId': 'ID ключа TURN (Key ID)',
  'cloudflare_turn.apiToken': 'API-токен ключа TURN',
  'cloudflare_sfu.appId': 'ID приложения Realtime SFU (App ID)',
  'cloudflare_sfu.appToken': 'Секрет приложения (App Secret)',
  'turnstile.secretKey': 'Секретный ключ (Secret key)',
  'turnstile.siteKey': 'Ключ сайта (Site key, публичный)',
  'turnstile.hostnames': 'Разрешённые домены сайта (через запятую)',
  'livekit.url': 'Адрес сервера',
  'livekit.apiKey': 'Ключ API',
  'livekit.apiSecret': 'Секрет API',
  'apns.privateKey': 'Содержимое файла ключа (.p8)',
  'apns.teamId': 'ID команды Apple',
  'aws_rekognition.accessKeyId': 'ID ключа доступа (пусто = роль сервера)',
  'aws_rekognition.secretAccessKey': 'Секретный ключ доступа',
  'fcm.clientEmail': 'Email сервисного аккаунта',
  'sentry.mobileDsn': 'Адрес для отчётов приложения (DSN)',
  'sentry.adminDsn': 'Адрес для отчётов админки (DSN)',
  'bunny_stream.apiKey': 'API-ключ библиотеки',
  'google_translate.apiKey': 'API-ключ',
  'ses.accessKeyId': 'ID ключа доступа AWS (только без роли сервера)',
  'cockroach_cloud.apiKey': 'API-ключ (сервисный аккаунт, только чтение)',
  'cockroach_cloud.clusterId': 'ID кластера',
  'storage.accessKeyId': 'ID ключа доступа (пусто = роль сервера)',
  'storage.secretAccessKey': 'Секретный ключ доступа',
};

const HINTS: Record<string, string> = {
  '11 characters from the Play Console': '11 символов из Play Console',
  '24+ letters / digits': '24 и более букв или цифр',
  'digits, e.g. 123456': 'цифры, например 123456',
  'e.g. vz-abc123.b-cdn.net': 'например vz-abc123.b-cdn.net',
};

export function providerLabel(id: string, fallback: string): string {
  return PROVIDER_RU[id]?.label ?? fallback;
}
export function providerDescription(id: string, fallback: string): string {
  return PROVIDER_RU[id]?.description ?? fallback;
}
export function providerWarning(id: string, fallback: string | null | undefined): string | null {
  return PROVIDER_RU[id]?.warning ?? fallback ?? null;
}
/** Owner 2026-10-07: the exact English name the service itself uses on its
 * site, shown next to the Russian one so it's clear what to copy where. */
const FIELD_EN: Record<string, string> = {
  'cloudflare_r2.accountId': 'Account ID',
  'cloudflare_r2.accessKeyId': 'Access Key ID',
  'cloudflare_r2.secretAccessKey': 'Secret Access Key',
  'cloudflare_r2.bucket': 'Bucket name',
  'cloudflare_r2.publicBaseUrl': 'Custom domain',
  'cloudflare_r2.zoneId': 'Zone ID',
  'cloudflare_r2.purgeToken': 'API token (Cache Purge)',
  'cloudflare_turn.keyId': 'TURN Key ID',
  'cloudflare_turn.apiToken': 'API Token',
  'cloudflare_sfu.appId': 'App ID',
  'cloudflare_sfu.appToken': 'App Secret',
  'turnstile.secretKey': 'Secret key',
  'turnstile.siteKey': 'Site key',
  'turnstile.hostnames': 'Allowed hostnames',
  'bunny_stream.libraryId': 'Video Library ID',
  'bunny_stream.cdnHostname': 'CDN Hostname',
  'bunny_stream.apiKey': 'API Key',
  'bunny_stream.tokenAuthKey': 'Token Authentication Key',
  'google_translate.apiKey': 'API key',
  'stripe.secretKey': 'Secret key / Restricted key',
  'stripe.webhookSecret': 'Signing secret',
  'stripe.connectWebhookSecret': 'Signing secret',
  'stripe.priceId': 'Price ID',
  'stripe.priceSeatId': 'Price ID',
  'stripe.priceYearlyId': 'Price ID',
  'twilio.accountSid': 'Account SID',
  'twilio.authToken': 'Auth Token',
  'twilio.fromNumber': 'Phone Number',
  'twilio.messagingServiceSid': 'Messaging Service SID',
  'twilio.androidAppHash': 'App hash',
  'ses.region': 'AWS Region',
  'ses.fromAddress': 'Verified identity',
  'ses.accessKeyId': 'Access key ID',
  'ses.secretAccessKey': 'Secret access key',
  'fcm.projectId': 'project_id',
  'fcm.clientEmail': 'client_email',
  'fcm.privateKey': 'private_key',
  'turn.urls': 'TURN URLs',
  'turn.secret': 'static-auth-secret',
  'turn.stunUrls': 'STUN URLs',
  'persona.apiKey': 'API Key',
  'google_signin.clientIds': 'Client ID',
  'apple_signin.bundleIds': 'Bundle ID',
  'apple_signin.teamId': 'Team ID',
  'ny_registry.appToken': 'App Token',
  'storage.region': 'AWS Region',
  'storage.bucketDocuments': 'Bucket name',
  'storage.bucketMedia': 'Bucket name',
  'storage.accessKeyId': 'Access key ID',
  'storage.secretAccessKey': 'Secret access key',
  'storage.cdnBaseUrl': 'Distribution domain name',
  'storage.privateCdnDomain': 'Distribution domain name',
  'storage.privateCdnKeyId': 'Public key ID',
  'storage.privateCdnPrivateKey': 'Private key (PEM)',
  'sentry.dsn': 'DSN',
  'sentry.mobileDsn': 'DSN',
  'sentry.adminDsn': 'DSN',
  'stripe.publishableKey': 'Publishable key',
  'apns.keyId': 'Key ID',
  'apns.teamId': 'Team ID',
  'apns.privateKey': 'Auth key (.p8 file)',
  'livekit.url': 'Project URL',
  'livekit.apiKey': 'API Key',
  'livekit.apiSecret': 'API Secret',
  'aws_rekognition.region': 'Region',
  'aws_rekognition.accessKeyId': 'Access key ID',
  'aws_rekognition.secretAccessKey': 'Secret access key',
  'photodna.subscriptionKey': 'Ocp-Apim-Subscription-Key',
  'photodna.endpoint': 'Endpoint',
  'ncmec.username': 'Username',
  'ncmec.password': 'Password',
  'ncmec.environment': 'Environment',
  'cockroach_cloud.apiKey': 'API key',
  'cockroach_cloud.clusterId': 'Cluster ID',
};

/**
 * The server variable (env / config key) each field falls back to: the name
 * the developer and the hosting panel know it by. Shown next to the Russian
 * label (owner 2026-10-22: original technical names next to the Russian ones).
 * Mirrors `env:` in apps/api common/secrets/provider-registry.ts; a test
 * keeps them in step.
 */
export const FIELD_ENV: Record<string, string> = {
  'cloudflare_r2.accountId': 'CLOUDFLARE_R2_ACCOUNT_ID',
  'cloudflare_r2.accessKeyId': 'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'cloudflare_r2.secretAccessKey': 'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'cloudflare_r2.bucket': 'CLOUDFLARE_R2_BUCKET',
  'cloudflare_r2.publicBaseUrl': 'CLOUDFLARE_R2_PUBLIC_BASE_URL',
  'cloudflare_r2.zoneId': 'CLOUDFLARE_R2_ZONE_ID',
  'cloudflare_r2.purgeToken': 'CLOUDFLARE_R2_PURGE_TOKEN',
  'bunny_stream.libraryId': 'BUNNY_LIBRARY_ID',
  'bunny_stream.cdnHostname': 'BUNNY_CDN_HOSTNAME',
  'bunny_stream.apiKey': 'BUNNY_API_KEY',
  'bunny_stream.tokenAuthKey': 'BUNNY_TOKEN_AUTH_KEY',
  'bunny_stream.webhookToken': 'BUNNY_WEBHOOK_TOKEN',
  'bunny_stream.readOnlyApiKey': 'BUNNY_READ_ONLY_API_KEY',
  'google_translate.apiKey': 'GOOGLE_TRANSLATE_API_KEY',
  'stripe.secretKey': 'STRIPE_SECRET_KEY',
  'stripe.publishableKey': 'STRIPE_PUBLISHABLE_KEY',
  'stripe.webhookSecret': 'STRIPE_WEBHOOK_SECRET',
  'stripe.connectWebhookSecret': 'STRIPE_CONNECT_WEBHOOK_SECRET',
  'stripe.priceId': 'STRIPE_PRICE_ID',
  'stripe.priceSeatId': 'STRIPE_PRICE_SEAT_ID',
  'stripe.priceYearlyId': 'STRIPE_PRICE_YEARLY_ID',
  'twilio.accountSid': 'TWILIO_ACCOUNT_SID',
  'twilio.authToken': 'TWILIO_AUTH_TOKEN',
  'twilio.fromNumber': 'TWILIO_FROM_NUMBER',
  'twilio.messagingServiceSid': 'TWILIO_MESSAGING_SERVICE_SID',
  'twilio.androidAppHash': 'SMS_ANDROID_APP_HASH',
  'ses.region': 'SES_REGION',
  'ses.fromAddress': 'SES_FROM_ADDRESS',
  'ses.accessKeyId': 'AWS_ACCESS_KEY_ID',
  'ses.secretAccessKey': 'AWS_SECRET_ACCESS_KEY',
  'fcm.projectId': 'FCM_PROJECT_ID',
  'fcm.clientEmail': 'FCM_CLIENT_EMAIL',
  'fcm.privateKey': 'FCM_PRIVATE_KEY',
  'apns.keyId': 'APNS_KEY_ID',
  'apns.teamId': 'APNS_TEAM_ID',
  'apns.privateKey': 'APNS_PRIVATE_KEY',
  'turn.urls': 'TURN_URLS',
  'turn.secret': 'TURN_SECRET',
  'cloudflare_turn.keyId': 'CLOUDFLARE_TURN_KEY_ID',
  'cloudflare_turn.apiToken': 'CLOUDFLARE_TURN_API_TOKEN',
  'cloudflare_sfu.appId': 'CLOUDFLARE_SFU_APP_ID',
  'cloudflare_sfu.appToken': 'CLOUDFLARE_SFU_APP_TOKEN',
  'turnstile.secretKey': 'TURNSTILE_SECRET_KEY',
  'turnstile.siteKey': 'TURNSTILE_SITE_KEY',
  'turnstile.hostnames': 'TURNSTILE_HOSTNAMES',
  'turn.stunUrls': 'STUN_URLS',
  'livekit.url': 'LIVEKIT_URL',
  'livekit.apiKey': 'LIVEKIT_API_KEY',
  'livekit.apiSecret': 'LIVEKIT_API_SECRET',
  'persona.apiKey': 'PERSONA_API_KEY',
  'google_signin.clientIds': 'GOOGLE_CLIENT_IDS',
  'apple_signin.bundleIds': 'APPLE_BUNDLE_IDS',
  'apple_signin.teamId': 'APPLE_TEAM_ID',
  'ny_registry.appToken': 'NY_OPEN_DATA_APP_TOKEN',
  'storage.region': 'S3_REGION',
  'storage.bucketDocuments': 'S3_BUCKET_DOCUMENTS',
  'storage.bucketMedia': 'S3_BUCKET_MEDIA',
  'storage.accessKeyId': 'S3_ACCESS_KEY_ID',
  'storage.secretAccessKey': 'S3_SECRET_ACCESS_KEY',
  'storage.cdnBaseUrl': 'MEDIA_CDN_BASE_URL',
  'storage.privateCdnDomain': 'CLOUDFRONT_PRIVATE_DOMAIN',
  'storage.privateCdnKeyId': 'CLOUDFRONT_PRIVATE_KEY_ID',
  'storage.privateCdnPrivateKey': 'CLOUDFRONT_PRIVATE_KEY_PEM',
  'sentry.dsn': 'SENTRY_DSN',
  'cockroach_cloud.apiKey': 'COCKROACH_CLOUD_API_KEY',
  'cockroach_cloud.clusterId': 'COCKROACH_CLUSTER_ID',
  'aws_rekognition.region': 'REKOGNITION_REGION',
  'aws_rekognition.accessKeyId': 'REKOGNITION_ACCESS_KEY_ID',
  'aws_rekognition.secretAccessKey': 'REKOGNITION_SECRET_ACCESS_KEY',
  'photodna.subscriptionKey': 'PHOTODNA_SUBSCRIPTION_KEY',
  'photodna.endpoint': 'PHOTODNA_ENDPOINT',
  'ncmec.username': 'NCMEC_USERNAME',
  'ncmec.password': 'NCMEC_PASSWORD',
  'ncmec.environment': 'NCMEC_ENVIRONMENT',
};

export function fieldLabel(provider: string, name: string, fallback: string): string {
  const ru = FIELD_BY_PROVIDER[`${provider}.${name}`] ?? FIELD_BY_NAME[name] ?? fallback;
  const en = FIELD_EN[`${provider}.${name}`];
  if (!en || ru === en) return ru;
  // «ID ключа (только без роли)» → «ID ключа (Access key ID), только без роли»
  const at = ru.indexOf(' (');
  return at < 0 ? `${ru} (${en})` : `${ru.slice(0, at)} (${en}), ${ru.slice(at + 2, -1)}`;
}
/** The label with the server variable after it: «Регион (AWS Region) · SES_REGION». */
export function fieldLabelWithKey(provider: string, name: string, fallback: string): string {
  const label = fieldLabel(provider, name, fallback);
  const env = FIELD_ENV[`${provider}.${name}`];
  return env && !label.includes(env) ? `${label} · ${env}` : label;
}
export function fieldHint(hint: string | null | undefined): string | null {
  if (!hint) return null;
  return HINTS[hint] ?? hint;
}
