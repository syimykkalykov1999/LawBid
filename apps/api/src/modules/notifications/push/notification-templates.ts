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
  // Owner 2026-10-05: a client offered their case to the attorney.
  case_invite_received: {
    group: 'bids',
    en: {
      title: 'A client offers you a case',
      body: 'Open it and answer with a bid or decline.',
    },
    ru: {
      title: 'Клиент предлагает вам дело',
      body: 'Откройте его и ответьте бидом или откажитесь.',
    },
  },
  case_invite_declined: {
    group: 'bids',
    en: {
      title: 'Invitation declined',
      body: 'The attorney declined your case. Invite another one.',
    },
    ru: {
      title: 'Приглашение отклонено',
      body: 'Адвокат отказался от дела. Пригласите другого.',
    },
  },
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
  // Owner 2026-10-05: the case's date ({days} = days left).
  case_deadline_soon: {
    group: 'cases',
    en: {
      title: 'The case date is coming up',
      body: 'Days left until the date: {days}. Open the case.',
    },
    ru: {
      title: 'Срок по делу приближается',
      body: 'Дней до срока: {days}. Откройте дело.',
    },
  },
  case_deadline_today: {
    group: 'cases',
    en: {
      title: 'The case date is today',
      body: 'Today is the date set for the case.',
    },
    ru: {
      title: 'Срок по делу — сегодня',
      body: 'Сегодня дата, указанная в деле.',
    },
  },
  case_deadline_passed: {
    group: 'cases',
    en: {
      title: 'The case date has passed',
      body: 'Nobody is hired yet. Update the date or the urgency so attorneys see what is current.',
    },
    ru: {
      title: 'Срок по делу прошёл',
      body: 'Адвокат ещё не выбран. Обновите дату или срочность, чтобы адвокаты видели актуальное.',
    },
  },
  case_deadline_changed: {
    group: 'cases',
    en: {
      title: 'The case date changed',
      body: 'The other side changed the date or urgency of your case.',
    },
    ru: {
      title: 'Срок по делу изменён',
      body: 'Другая сторона изменила дату или срочность дела.',
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
  case_disputed: {
    group: 'cases',
    en: {
      title: 'Completion disputed',
      body: 'The other side disputed completion. Support will review the case.',
    },
    ru: {
      title: 'Завершение оспорено',
      body: 'Другая сторона оспорила завершение. Поддержка рассмотрит кейс.',
    },
  },
  dispute_resolved: {
    group: 'cases',
    en: {
      title: 'Dispute resolved',
      body: 'Support decided the dispute. The case is back in progress.',
    },
    ru: {
      title: 'Спор решён',
      body: 'Поддержка рассмотрела спор. Кейс снова в работе.',
    },
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
  // Owner 2026-09-30 (opt-in).
  followed_post: {
    group: 'social',
    en: {
      title: 'New from someone you follow',
      body: 'A person you follow published something new.',
    },
    ru: {
      title: 'Новое от тех, на кого вы подписаны',
      body: 'Человек, на которого вы подписаны, опубликовал новое.',
    },
  },
  new_case: {
    group: 'cases',
    en: {
      title: 'New case for you',
      body: 'A new case in your practice areas was published.',
    },
    ru: {
      title: 'Новый кейс для вас',
      body: 'Опубликован новый кейс по вашим практикам.',
    },
  },
  // Owner 2026-10-05: an urgent case (urgent / very urgent level or a
  // date within the urgent threshold).
  new_urgent_case: {
    group: 'cases',
    en: {
      title: 'Urgent case for you',
      body: 'An urgent case in your practice areas was published.',
    },
    ru: {
      title: 'Срочное дело для вас',
      body: 'Опубликовано срочное дело по вашим практикам.',
    },
  },
  // OQ-048.
  assistant_request: {
    group: 'messages',
    en: {
      title: 'Approval needed',
      body: 'Your assistant asks you to approve something.',
    },
    ru: {
      title: 'Нужно ваше разрешение',
      body: 'Помощник просит разрешение на публикацию или изменение.',
    },
  },
  assistant_task: {
    group: 'cases',
    en: { title: 'New task', body: 'Your assistant set a task for you.' },
    ru: { title: 'Новая задача', body: 'Помощник поставил вам задачу.' },
  },
  assistant_joined: {
    group: 'system',
    en: {
      title: 'Assistant joined',
      body: 'An assistant joined your account.',
    },
    ru: {
      title: 'Помощник подключился',
      body: 'Помощник вошёл в ваш аккаунт.',
    },
  },
  assistant_result: {
    group: 'messages',
    en: {
      title: 'The attorney answered',
      body: 'Open Results to see the decision.',
    },
    ru: {
      title: 'Адвокат ответил',
      body: 'Откройте «Результаты», чтобы увидеть решение.',
    },
  },
  // Owner 2026-10-05: the planner (no task text in a push: docs/05 §9.5).
  task_reminder: {
    group: 'cases',
    en: { title: 'Task reminder', body: 'A task in your planner is due.' },
    ru: {
      title: 'Напоминание о задаче',
      body: 'Подошло время задачи в вашем планировщике.',
    },
  },
  task_assigned: {
    group: 'cases',
    en: { title: 'Task for you', body: 'The attorney assigned you a task.' },
    ru: { title: 'Задача для вас', body: 'Адвокат назначил вам задачу.' },
  },
  task_purge_soon: {
    group: 'system',
    en: {
      title: 'Archived tasks will be removed',
      body: 'Finished tasks older than a year are removed soon. Open the archive to keep the ones you need.',
    },
    ru: {
      title: 'Архив задач скоро очистится',
      body: 'Выполненные задачи старше года скоро удалятся. Откройте архив и сохраните нужные.',
    },
  },
  partner_commission: {
    group: 'system',
    en: {
      title: 'Partner earnings',
      body: 'Someone you brought to LawBid qualified. Your commission is accrued.',
    },
    ru: {
      title: 'Партнёрское начисление',
      body: 'Приглашённый вами выполнил условие. Вознаграждение начислено.',
    },
  },
  partner_payout: {
    group: 'system',
    en: {
      title: 'Partner payout',
      body: 'Your partner earnings were paid out. See the details in the app.',
    },
    ru: {
      title: 'Партнёрская выплата',
      body: 'Ваше партнёрское вознаграждение выплачено. Подробности в приложении.',
    },
  },
  partner_approved: {
    group: 'system',
    en: {
      title: 'You are a LawBid partner',
      body: 'Your request is approved. Your partner link is ready in Settings.',
    },
    ru: {
      title: 'Вы партнёр LawBid',
      body: 'Заявка одобрена. Ваша партнёрская ссылка готова в настройках.',
    },
  },
  partner_declined: {
    group: 'system',
    en: {
      title: 'Partner request declined',
      body: 'The LawBid team did not approve your partner request this time.',
    },
    ru: {
      title: 'Заявка партнёра отклонена',
      body: 'Команда LawBid пока не одобрила вашу заявку на участие в программе.',
    },
  },
  referral_reward: {
    group: 'system',
    en: {
      title: 'Invite bonus',
      body: 'A friend joined with your invite. Your bonus is added.',
    },
    ru: {
      title: 'Бонус за приглашение',
      body: 'Друг присоединился по вашему приглашению. Бонус начислен.',
    },
  },
  promotion_started: {
    group: 'cases',
    en: {
      title: 'Promotion started',
      body: 'People now see it in their feed. Reach and clicks are in My promotions.',
    },
    ru: {
      title: 'Продвижение началось',
      body: 'Его уже показывают в ленте. Охват и клики — в «Мои продвижения».',
    },
  },
  promotion_ended: {
    group: 'cases',
    en: {
      title: 'Promotion ended',
      body: 'Your promotion has finished. See the results in My promotions.',
    },
    ru: {
      title: 'Продвижение завершилось',
      body: 'Продвижение завершилось. Итоги — в «Мои продвижения».',
    },
  },
  // Owner 2026-10-05: client → attorney payments through the platform.
  case_payment_received: {
    group: 'cases',
    en: {
      title: 'Payment received',
      body: 'A client paid you through LawBid. The money goes to your Stripe account.',
    },
    ru: {
      title: 'Оплата получена',
      body: 'Клиент оплатил вам через LawBid. Деньги поступят на ваш счёт Stripe.',
    },
  },
  case_payment_sent: {
    group: 'cases',
    en: {
      title: 'Payment sent',
      body: 'Your payment to the attorney went through. The receipt is in the case.',
    },
    ru: {
      title: 'Оплата отправлена',
      body: 'Ваш платёж адвокату прошёл. Чек — в карточке дела.',
    },
  },
  case_payment_refunded: {
    group: 'cases',
    en: {
      title: 'Refund issued',
      body: 'The attorney refunded part or all of your payment.',
    },
    ru: {
      title: 'Возврат оформлен',
      body: 'Адвокат вернул вам часть или всю сумму платежа.',
    },
  },
  case_payment_disputed: {
    group: 'cases',
    en: {
      title: 'Payment disputed',
      body: 'A client disputed a payment with their bank. Respond in your Stripe dashboard.',
    },
    ru: {
      title: 'Платёж оспорен',
      body: 'Клиент оспорил платёж через банк. Ответьте в панели Stripe.',
    },
  },
  payment_request_created: {
    group: 'cases',
    en: {
      title: 'Payment request',
      body: 'Your attorney sent you a payment request. Open the case to pay in two taps.',
    },
    ru: {
      title: 'Счёт от адвоката',
      body: 'Адвокат выставил вам счёт. Откройте дело, чтобы оплатить в два касания.',
    },
  },
  payment_request_due: {
    group: 'cases',
    en: {
      title: 'Payment due soon',
      body: 'A payment request from your attorney is due soon.',
    },
    ru: {
      title: 'Скоро срок оплаты',
      body: 'Срок оплаты счёта от адвоката скоро наступит.',
    },
  },
  payment_request_overdue: {
    group: 'cases',
    en: {
      title: 'Payment overdue',
      body: 'A payment request from your attorney is past its due date.',
    },
    ru: {
      title: 'Счёт просрочен',
      body: 'Срок оплаты счёта от адвоката прошёл.',
    },
  },
  payment_fee_countered: {
    group: 'cases',
    en: {
      title: 'Stripe fee: counter-offer',
      body: 'The other side proposed another way to cover the Stripe fee.',
    },
    ru: {
      title: 'Комиссия Stripe: встречное предложение',
      body: 'Другая сторона предложила иначе разделить комиссию Stripe.',
    },
  },
  payment_fee_agreed: {
    group: 'cases',
    en: {
      title: 'Stripe fee agreed',
      body: 'Who covers the Stripe fee on the invoice is agreed.',
    },
    ru: {
      title: 'Комиссия Stripe согласована',
      body: 'Кто платит комиссию Stripe по счёту — согласовано.',
    },
  },
  payment_request_canceled: {
    group: 'cases',
    en: {
      title: 'Payment request withdrawn',
      body: 'Your attorney withdrew a payment request.',
    },
    ru: {
      title: 'Счёт отозван',
      body: 'Адвокат отозвал выставленный счёт.',
    },
  },
  payout_account_status: {
    group: 'system',
    en: {
      title: 'Payout account',
      body: 'The status of your payout account changed. Check Settings → Receiving payments.',
    },
    ru: {
      title: 'Счёт для выплат',
      body: 'Статус вашего счёта для выплат изменился. Проверьте Настройки → Приём оплат.',
    },
  },
  admin_broadcast: {
    group: 'system',
    en: { title: 'LawBid', body: 'A message from the LawBid team.' },
    ru: { title: 'LawBid', body: 'Сообщение от команды LawBid.' },
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
  review_requested: {
    group: 'cases',
    en: {
      title: 'Leave a review',
      body: 'The case is closed. Tell others how it went.',
    },
    ru: {
      title: 'Оставьте отзыв',
      body: 'Кейс закрыт. Расскажите, как всё прошло.',
    },
  },
  review_received: {
    group: 'cases',
    en: { title: 'New review', body: 'You received a new review.' },
    ru: { title: 'Новый отзыв', body: 'Вам оставили новый отзыв.' },
  },
  post_like: {
    group: 'social',
    en: { title: 'New like', body: 'Someone liked your post.' },
    ru: { title: 'Новый лайк', body: 'Ваш пост понравился.' },
  },
  post_repost: {
    group: 'social',
    en: { title: 'New repost', body: 'Someone reposted your post.' },
    ru: { title: 'Новый репост', body: 'Вашим постом поделились.' },
  },
  comment_like: {
    group: 'social',
    en: { title: 'New like', body: 'Someone liked your comment.' },
    ru: { title: 'Новый лайк', body: 'Ваш комментарий понравился.' },
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
  security_phone_changed: {
    group: 'system',
    en: {
      title: 'Phone number changed',
      body: 'Support changed the phone number on your account at your request. Not you? Contact support right away.',
    },
    ru: {
      title: 'Номер телефона изменён',
      body: 'Поддержка сменила номер телефона в вашем аккаунте по вашему запросу. Это были не вы? Сразу напишите в поддержку.',
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

/** Owner 2026-10-05: fills `{name}` placeholders from the payload's
 * string / number values (identifiers and counts only — docs/05 §9.5);
 * an unknown placeholder stays as written. */
export function fillTemplate(
  text: TemplateText,
  payload: Record<string, unknown>,
): TemplateText {
  const fill = (s: string) =>
    s.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k: string) => {
      const v = payload[k];
      return typeof v === 'number' || typeof v === 'string' ? String(v) : m;
    });
  return { title: fill(text.title), body: fill(text.body) };
}
