import type { NotificationType } from '@prisma/client';

export interface TemplateText {
  title: string;
  body: string;
}

/**
 * docs/04 §13: "Тексты через i18n-ключи notif.cases.*, notif.bids.*".
 * Key = `notif.<group>.<type>.title|body`. These are the built-in en/ru
 * defaults (also listed in prisma/seed/pending_keys/stage-4-8.csv); the
 * i18n_translations table overrides them per language. Texts carry no
 * personal data (docs/05 §9.5).
 */
export const NOTIFICATION_TEMPLATES: Partial<
  Record<
    NotificationType,
    {
      group: 'bids' | 'cases' | 'messages' | 'social' | 'system';
      en: TemplateText;
      ru: TemplateText;
    }
  >
> = {
  bid_received: {
    group: 'bids',
    en: { title: 'New bid', body: 'An attorney sent a bid on your case.' },
    ru: { title: 'Новый бид', body: 'Адвокат отправил бид на ваш кейс.' },
  },
  offer_countered: {
    group: 'bids',
    en: {
      title: 'Counter-offer',
      body: 'You received a counter-offer. Your move.',
    },
    ru: {
      title: 'Встречное предложение',
      body: 'Вам сделали встречное предложение. Ваш ход.',
    },
  },
  bid_accepted: {
    group: 'bids',
    en: {
      title: 'Bid accepted',
      body: 'The client accepted your bid. Contacts and chat are open.',
    },
    ru: {
      title: 'Бид принят',
      body: 'Клиент принял ваш бид. Контакты и чат открыты.',
    },
  },
  offer_accepted: {
    group: 'bids',
    en: {
      title: 'Offer accepted',
      body: 'The attorney accepted your offer. The case is in progress.',
    },
    ru: {
      title: 'Предложение принято',
      body: 'Адвокат принял ваше предложение. Кейс в работе.',
    },
  },
  bid_rejected: {
    group: 'bids',
    en: { title: 'Bid update', body: 'A bid on the case is no longer active.' },
    ru: { title: 'Изменение по биду', body: 'Бид по кейсу больше не активен.' },
  },
  negotiation_failed: {
    group: 'bids',
    en: {
      title: 'No agreement',
      body: 'The parties did not reach an agreement.',
    },
    ru: { title: 'Стороны не договорились', body: 'Стороны не договорились.' },
  },
  case_updated: {
    group: 'cases',
    en: {
      title: 'Case updated',
      body: 'The client updated a case you bid on.',
    },
    ru: {
      title: 'Кейс обновлён',
      body: 'Клиент обновил кейс, на который вы сделали бид.',
    },
  },
  case_stale_prompt: {
    group: 'cases',
    en: {
      title: 'Is your case still relevant?',
      body: 'Keep it open or close it.',
    },
    ru: {
      title: 'Кейс ещё актуален?',
      body: 'Оставьте его открытым или закройте.',
    },
  },
  case_archived: {
    group: 'cases',
    en: {
      title: 'Case archived',
      body: 'Your case moved to the archive. You can restore it.',
    },
    ru: {
      title: 'Кейс в архиве',
      body: 'Ваш кейс перемещён в архив. Его можно вернуть.',
    },
  },
  completion_requested: {
    group: 'cases',
    en: {
      title: 'Client marked the case done',
      body: 'Confirm or dispute within 7 days.',
    },
    ru: {
      title: 'Клиент отметил «Выполнено»',
      body: 'Подтвердите или оспорьте в течение 7 дней.',
    },
  },
  completion_reminder: {
    group: 'cases',
    en: {
      title: 'Case closes soon',
      body: 'The case closes automatically within 24 hours.',
    },
    ru: {
      title: 'Скоро автозакрытие',
      body: 'Кейс закроется автоматически в течение 24 часов.',
    },
  },
  case_closed: {
    group: 'cases',
    en: { title: 'Case closed', body: 'The case is closed.' },
    ru: { title: 'Кейс закрыт', body: 'Кейс закрыт.' },
  },
  contact_issue_update: {
    group: 'cases',
    en: {
      title: 'Contact report reviewed',
      body: 'Support reviewed the "can’t reach" report.',
    },
    ru: {
      title: 'Обращение рассмотрено',
      body: 'Поддержка рассмотрела обращение «Не могу связаться».',
    },
  },
  moderation_notice: {
    group: 'cases',
    en: {
      title: 'Account notice',
      body: 'Please keep your contact details up to date.',
    },
    ru: {
      title: 'Уведомление по аккаунту',
      body: 'Пожалуйста, поддерживайте контакты в актуальном состоянии.',
    },
  },
  // docs/05 §9.2 (stage 5.8).
  new_message: {
    group: 'messages',
    en: { title: 'New message', body: 'You have a new message.' },
    ru: { title: 'Новое сообщение', body: 'У вас новое сообщение.' },
  },
  new_follower: {
    group: 'social',
    en: { title: 'New follower', body: 'Someone started following you.' },
    ru: { title: 'Новый подписчик', body: 'На вас подписались.' },
  },
  post_comment: {
    group: 'social',
    en: { title: 'New comment', body: 'Someone commented on your post.' },
    ru: { title: 'Новый комментарий', body: 'Ваш пост прокомментировали.' },
  },
  // OQ-042.
  mention: {
    group: 'social',
    en: {
      title: 'You were mentioned',
      body: 'Someone mentioned you in LawBid.',
    },
    ru: { title: 'Вас отметили', body: 'Вас отметили в LawBid.' },
  },
  // OQ-041.
  missed_call: {
    group: 'messages',
    en: { title: 'Missed call', body: 'You missed a call in LawBid.' },
    ru: { title: 'Пропущенный звонок', body: 'Вам звонили в LawBid.' },
  },
  case_comment: {
    group: 'cases',
    en: { title: 'New comment', body: 'Someone commented on your case.' },
    ru: { title: 'Новый комментарий', body: 'Ваш кейс прокомментировали.' },
  },
  comment_reply: {
    group: 'social',
    en: { title: 'New reply', body: 'Someone replied to your comment.' },
    ru: { title: 'Новый ответ', body: 'На ваш комментарий ответили.' },
  },
  verification_update: {
    group: 'system',
    en: {
      title: 'Verification update',
      body: 'Your verification status has changed.',
    },
    ru: {
      title: 'Верификация',
      body: 'Статус вашей верификации изменился.',
    },
  },
  subscription_trial_ending: {
    group: 'system',
    en: { title: 'Trial ending', body: 'Your free trial ends soon.' },
    ru: {
      title: 'Пробный период',
      body: 'Ваш пробный период скоро закончится.',
    },
  },
  subscription_payment_failed: {
    group: 'system',
    en: {
      title: 'Payment failed',
      body: 'We could not charge your subscription.',
    },
    ru: {
      title: 'Оплата не прошла',
      body: 'Не удалось оплатить подписку.',
    },
  },
  subscription_status: {
    group: 'system',
    en: {
      title: 'Subscription',
      body: 'Your subscription status has changed.',
    },
    ru: { title: 'Подписка', body: 'Статус вашей подписки изменился.' },
  },
  data_export_ready: {
    group: 'system',
    en: {
      title: 'Your data export is ready',
      body: 'The download link was sent to your email and works for 24 hours.',
    },
    ru: {
      title: 'Выгрузка данных готова',
      body: 'Ссылка на скачивание отправлена на вашу почту и действует 24 часа.',
    },
  },
  case_history_export_ready: {
    group: 'system',
    en: {
      title: 'Case history PDF is ready',
      body: 'Open Settings → Case history to download it (link valid 10 minutes).',
    },
    ru: {
      title: 'PDF истории кейсов готов',
      body: 'Откройте Настройки → История кейсов, чтобы скачать (ссылка действует 10 минут).',
    },
  },
  security_new_device: {
    group: 'system',
    en: {
      title: 'New sign-in',
      body: 'Your account was signed in on a new device.',
    },
    ru: {
      title: 'Новый вход',
      body: 'В ваш аккаунт вошли с нового устройства.',
    },
  },
};

/** Types without a template yet (docs/05 adds theirs). */
export const GENERIC_TEMPLATE: { en: TemplateText; ru: TemplateText } = {
  en: { title: 'LawBid', body: 'You have a new notification.' },
  ru: { title: 'LawBid', body: 'У вас новое уведомление.' },
};

export function templateKeys(type: NotificationType): {
  title: string;
  body: string;
} | null {
  const t = NOTIFICATION_TEMPLATES[type];
  if (!t) return null;
  return {
    title: `notif.${t.group}.${type}.title`,
    body: `notif.${t.group}.${type}.body`,
  };
}
