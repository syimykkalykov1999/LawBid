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
  sentry: { label: 'Sentry (отчёты об ошибках)', description: 'Отчёты о сбоях и ошибках сервера, приложения и админки.' },
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
  dsn: 'Адрес для отчётов',
};

const FIELD_BY_PROVIDER: Record<string, string> = {
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
  'sentry.dsn': 'DSN',
  'cockroach_cloud.apiKey': 'API key',
  'cockroach_cloud.clusterId': 'Cluster ID',
};

export function fieldLabel(provider: string, name: string, fallback: string): string {
  const ru = FIELD_BY_PROVIDER[`${provider}.${name}`] ?? FIELD_BY_NAME[name] ?? fallback;
  const en = FIELD_EN[`${provider}.${name}`];
  if (!en || ru === en) return ru;
  // «ID ключа (только без роли)» → «ID ключа (Access key ID), только без роли»
  const at = ru.indexOf(' (');
  return at < 0 ? `${ru} (${en})` : `${ru.slice(0, at)} (${en}), ${ru.slice(at + 2, -1)}`;
}
export function fieldHint(hint: string | null | undefined): string | null {
  if (!hint) return null;
  return HINTS[hint] ?? hint;
}
