import type { EmailMessage } from '../auth/providers/email/email-provider.interface';
import {
  REQUIRED_TEMPLATE_VARS,
  type EmailTemplateKey,
} from '../auth/providers/email/email-template-render';
import {
  buildAdminLoginCodeEmail,
  buildContactOtpEmail,
  buildDataExportEmail,
  buildLoginOtpEmail,
  buildNewDeviceEmail,
  buildNotificationEmail,
} from '../auth/notifications/email-templates';

export interface CatalogVariable {
  name: string;
  /** Russian, for the admin. */
  description: string;
  sample: string;
}

export interface CatalogEntry {
  key: EmailTemplateKey;
  /** Russian, for the admin. */
  title: string;
  description: string;
  variables: CatalogVariable[];
  required: readonly string[];
  /** The built-in email rendered with the sample values. */
  sample: () => EmailMessage;
}

const SAMPLE_EMAIL = 'user@example.com';
const SAMPLE_AT = new Date('2026-10-02T14:30:00Z');
const SAMPLE_LINK_BASE = 'https://lawbid.app';

const CODE: CatalogVariable = {
  name: 'code',
  description: 'Одноразовый код (обязателен в тексте и HTML)',
  sample: '424242',
};
const TTL: CatalogVariable = {
  name: 'ttlMinutes',
  description: 'Сколько минут действует код',
  sample: '10',
};

/**
 * Owner 2026-10-02 — every built-in transactional email the admin can
 * override (modules/auth/notifications/email-templates.ts and the push
 * dispatcher's email copy of system notifications). The variable names
 * match the `template.vars` each builder sets.
 */
export const EMAIL_TEMPLATE_CATALOG: readonly CatalogEntry[] = [
  {
    key: 'login_otp',
    title: 'Код входа в приложение',
    description:
      'Письмо с кодом для входа по email. Ссылка (link) есть, только если приложение запросило вход по ссылке с этого телефона.',
    variables: [
      CODE,
      TTL,
      {
        name: 'link',
        description: 'Магическая ссылка входа (может быть пустой)',
        sample: `${SAMPLE_LINK_BASE}/auth/email-code?token=SAMPLE`,
      },
    ],
    required: REQUIRED_TEMPLATE_VARS.login_otp,
    sample: () =>
      buildLoginOtpEmail({
        email: SAMPLE_EMAIL,
        code: CODE.sample,
        ttlMinutes: 10,
        linkToken: 'SAMPLE',
        appLinkBaseUrl: SAMPLE_LINK_BASE,
      }),
  },
  {
    key: 'admin_login_code',
    title: 'Код входа в админ-панель',
    description: 'Код для входа сотрудника в админ-панель (без ссылки).',
    variables: [CODE, TTL],
    required: REQUIRED_TEMPLATE_VARS.admin_login_code,
    sample: () =>
      buildAdminLoginCodeEmail({
        email: SAMPLE_EMAIL,
        code: CODE.sample,
        ttlMinutes: 10,
      }),
  },
  {
    key: 'contact_otp',
    title: 'Подтверждение email',
    description: 'Код подтверждения при добавлении или смене email в профиле.',
    variables: [CODE, TTL],
    required: REQUIRED_TEMPLATE_VARS.contact_otp,
    sample: () =>
      buildContactOtpEmail({
        email: SAMPLE_EMAIL,
        code: CODE.sample,
        ttlMinutes: 10,
      }),
  },
  {
    key: 'new_device',
    title: 'Вход с нового устройства',
    description:
      'Предупреждение о входе в аккаунт с нового устройства со ссылкой на «Активные устройства».',
    variables: [
      {
        name: 'device',
        description: 'Название устройства и платформа',
        sample: 'iPhone 15 · ios',
      },
      {
        name: 'time',
        description: 'Время входа (UTC)',
        sample: '2026-10-02 14:30 UTC',
      },
      {
        name: 'link',
        description: 'Ссылка на «Активные устройства»',
        sample: `${SAMPLE_LINK_BASE}/profile/settings/devices`,
      },
    ],
    required: REQUIRED_TEMPLATE_VARS.new_device,
    sample: () =>
      buildNewDeviceEmail({
        email: SAMPLE_EMAIL,
        deviceName: 'iPhone 15',
        platform: 'ios',
        at: SAMPLE_AT,
        appLinkBaseUrl: SAMPLE_LINK_BASE,
      }),
  },
  {
    key: 'data_export',
    title: 'Выгрузка данных готова',
    description:
      'Ссылка на ZIP-архив с данными пользователя (действует 24 часа). Ссылка url обязательна.',
    variables: [
      {
        name: 'url',
        description: 'Ссылка на скачивание архива (обязательна)',
        sample: 'https://files.lawbid.app/exports/sample.zip',
      },
      {
        name: 'expiresAt',
        description: 'До какого времени работает ссылка (UTC)',
        sample: '2026-10-03 14:30 UTC',
      },
    ],
    required: REQUIRED_TEMPLATE_VARS.data_export,
    sample: () =>
      buildDataExportEmail({
        email: SAMPLE_EMAIL,
        url: 'https://files.lawbid.app/exports/sample.zip',
        expiresAt: new Date('2026-10-03T14:30:00Z'),
      }),
  },
  {
    key: 'notification',
    title: 'Системное уведомление (копия на email)',
    description:
      'Email-копия важных системных уведомлений (верификация, подписка, модерация, смена телефона): заголовок и текст пуша.',
    variables: [
      {
        name: 'title',
        description: 'Заголовок уведомления',
        sample: 'Verification approved',
      },
      {
        name: 'body',
        description: 'Текст уведомления',
        sample: 'Your attorney profile is verified.',
      },
    ],
    required: REQUIRED_TEMPLATE_VARS.notification,
    sample: () =>
      buildNotificationEmail({
        email: SAMPLE_EMAIL,
        title: 'Verification approved',
        body: 'Your attorney profile is verified.',
      }),
  },
];

export function catalogEntry(key: string): CatalogEntry | undefined {
  return EMAIL_TEMPLATE_CATALOG.find((e) => e.key === key);
}

export function sampleVars(entry: CatalogEntry): Record<string, string> {
  return Object.fromEntries(entry.variables.map((v) => [v.name, v.sample]));
}
