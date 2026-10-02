/**
 * Russian names for the third-party services and their key fields. The API
 * sends English text (provider-registry); the admin maps it by provider id /
 * field name and falls back to the server text for anything unknown.
 */
export const PROVIDER_RU: Record<string, { label: string; description: string; warning?: string }> = {
  bunny_stream: {
    label: 'Bunny Stream (видео)',
    description: 'Видео в постах: загрузка прямо с телефона, обработка, CDN.',
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
  sentry: { label: 'Sentry (отчёты об ошибках)', description: 'Отчёты о сбоях и ошибках сервера.' },
};

const FIELD_BY_NAME: Record<string, string> = {
  libraryId: 'ID видеобиблиотеки',
  cdnHostname: 'Адрес CDN',
  apiKey: 'API-ключ',
  tokenAuthKey: 'Ключ защиты CDN-ссылок',
  webhookToken: 'Токен вебхука (любая длинная случайная строка)',
  secretKey: 'Секретный ключ',
  webhookSecret: 'Секрет подписи вебхука',
  priceId: 'ID цены (месяц)',
  priceSeatId: 'ID цены места помощника',
  priceYearlyId: 'ID цены (год, Prime)',
  accountSid: 'Account SID',
  authToken: 'Токен авторизации',
  fromNumber: 'Номер отправителя',
  messagingServiceSid: 'Messaging service SID',
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
  clientIds: 'Client ID (через запятую)',
  bundleIds: 'Bundle ID (через запятую)',
  teamId: 'Team ID',
  bucketDocuments: 'Бакет документов',
  bucketMedia: 'Бакет медиа',
  cdnBaseUrl: 'Базовый адрес CDN для медиа',
  dsn: 'DSN',
};

const FIELD_BY_PROVIDER: Record<string, string> = {
  'bunny_stream.apiKey': 'API-ключ библиотеки',
  'ses.accessKeyId': 'ID ключа доступа AWS (только без роли сервера)',
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
export function fieldLabel(provider: string, name: string, fallback: string): string {
  return FIELD_BY_PROVIDER[`${provider}.${name}`] ?? FIELD_BY_NAME[name] ?? fallback;
}
export function fieldHint(hint: string | null | undefined): string | null {
  if (!hint) return null;
  return HINTS[hint] ?? hint;
}
