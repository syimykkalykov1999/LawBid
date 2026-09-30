// docs/06 (subscription, paywall, payment history) compiled-in strings,
// merged into StaticTranslatorRu/En like file05_strings.dart.

const file06Ru = <String, String>{
  // --- Подписка (docs/06 §1.7 п.1–2) ---
  'subscription.title': 'Подписка',
  'subscription.plan.badge': 'LawBid для адвокатов',
  'subscription.plan.perMonth': 'в месяц',
  'subscription.plan.trialLine':
      '7 дней бесплатно, затем {price} в месяц. Отмена в любой момент.',
  'subscription.plan.noTrialLine': '{price} в месяц. Отмена в любой момент.',
  'subscription.plan.feature.bids': 'Биды по кейсам без ограничений',
  'subscription.plan.feature.chat': 'Переписка с клиентами',
  'subscription.plan.feature.contacts': 'Контакты клиента после принятия бида',
  'subscription.plan.feature.noFees': 'Без комиссий с гонораров',
  'subscription.cta.startTrial': 'Начать бесплатный период',
  'subscription.cta.subscribe': 'Оформить подписку',
  'subscription.cta.resubscribe': 'Оформить снова',
  'subscription.cta.verifyFirst':
      'Кнопка станет активной после одобрения верификации.',
  'subscription.cta.goVerify': 'К верификации',
  'subscription.terms':
      'Списание автоматически раз в месяц. Отменить можно в любой момент в разделе «Управление».',
  'subscription.status.title': 'Текущий статус',
  'subscription.status.trialing': 'Пробный период',
  'subscription.status.active': 'Активна',
  'subscription.status.past_due': 'Ошибка оплаты',
  'subscription.status.canceled': 'Отменена',
  'subscription.status.expired': 'Истекла',
  'subscription.status.incomplete': 'Подтверждаем карту',
  'subscription.status.unknown': 'Статус уточняется',
  'subscription.line.trialEnds':
      'Пробный период до {date}, затем первое списание {price}.',
  'subscription.line.nextCharge': 'Следующее списание {price} — {date}.',
  'subscription.line.cancelScheduled':
      'Отмена запланирована. Доступ сохранится до {date}.',
  'subscription.line.endedAt': 'Доступ закончился {date}.',
  'subscription.line.ended':
      'Доступа к бидам и контактам нет. Новая подписка оформляется без пробного периода.',
  'subscription.line.graceUntil':
      'Доступ сохранится до {date}. Обновите карту, чтобы не потерять его.',
  'subscription.line.graceOver':
      'Доступ приостановлен до успешной оплаты. Обновите карту.',
  'subscription.line.incomplete':
      'Подтверждение обычно занимает меньше минуты. Экран обновится сам.',
  'subscription.action.manage': 'Управление',
  'subscription.action.cancel': 'Отменить',
  'subscription.action.updateCard': 'Обновить карту',
  'subscription.action.refresh': 'Обновить',
  'subscription.action.payments': 'История платежей',
  'subscription.paymentFailed.title': 'Платёж не прошёл',
  'subscription.paymentFailed.body':
      'Последнее списание не удалось. Обновите карту, чтобы сохранить доступ к бидам, чатам и контактам.',
  'subscription.cancel.title': 'Отменить подписку?',
  'subscription.cancel.body':
      'Доступ сохранится до {date}. Списаний больше не будет.',
  'subscription.cancel.bodyNoDate':
      'Доступ сохранится до конца оплаченного периода. Списаний больше не будет.',
  'subscription.cancel.confirm': 'Отменить подписку',
  'subscription.cancel.done': 'Подписка отменена. Доступ до {date}.',
  'subscription.cancel.doneNoDate': 'Подписка отменена.',
  'subscription.chargeNow.title': 'Пробный период недоступен',
  'subscription.chargeNow.body':
      'Пробный период недоступен: {price} будет списано сейчас. Продолжить?',
  'subscription.chargeNow.confirm': 'Оплатить {price}',
  'subscription.progress.starting': 'Готовим оплату…',
  'subscription.progress.collectingCard': 'Ожидаем карту…',
  'subscription.progress.confirming': 'Оформляем подписку…',
  'subscription.progress.syncing': 'Подтверждаем оплату…',
  'subscription.done.trial': 'Пробный период начался',
  'subscription.done.active': 'Подписка активна',
  'subscription.done.pending':
      'Оплата подтверждается. Статус обновится в течение минуты.',
  'subscription.card.failed': 'Не удалось подтвердить карту: {reason}',
  'subscription.card.unavailable': 'Оплата в этой сборке не настроена.',
  'subscription.portal.cantOpen': 'Не удалось открыть страницу управления.',
  // --- История платежей (docs/06 §1.7 п.4) ---
  'payments.title': 'История платежей',
  'payments.empty.title': 'Платежей пока нет',
  'payments.empty.message': 'Здесь появятся списания по подписке.',
  'payments.status.pending': 'В обработке',
  'payments.status.succeeded': 'Оплачено',
  'payments.status.failed': 'Не прошёл',
  'payments.status.refunded': 'Возврат',
  'payments.status.unknown': 'Статус уточняется',
  'payments.failureCode': 'Код ошибки: {code}',
  // --- Paywall (docs/06 §1.7 п.3) ---
  'paywall.title': 'Нужна подписка',
  'paywall.bid.title': 'Биды — по подписке',
  'paywall.bid.body':
      'Чтобы предложить клиенту свои условия, нужна активная подписка или пробный период.',
  'paywall.chat.title': 'Переписка с клиентами — по подписке',
  'paywall.chat.body':
      'Написать клиенту можно с активной подпиской или пробным периодом.',
  'paywall.contacts.title': 'Контакты клиента — по подписке',
  'paywall.contacts.body':
      'Телефон и e-mail клиента открываются с активной подпиской или пробным периодом.',
  'paywall.trialHint': '7 дней бесплатно для верифицированных адвокатов.',
  'paywall.cta': 'Перейти к подписке',
  // --- Выгрузка данных (docs/06 §5.2) ---
  'dataExport.title': 'Копия ваших данных',
  'dataExport.intro':
      'Мы соберём ZIP-архив с JSON-файлами и пришлём ссылку. Подготовка занимает несколько минут.',
  'dataExport.includes.profile': 'Профиль, согласия и настройки',
  'dataExport.includes.cases': 'Кейсы и биды',
  'dataExport.includes.social': 'Посты, комментарии и лайки',
  'dataExport.includes.messages': 'Ваши сообщения в чатах',
  'dataExport.includes.devices': 'Устройства и входы',
  'dataExport.link':
      'Ссылка действует 24 часа и придёт на {email}. Она также появится здесь.',
  'dataExport.linkNoEmail':
      'Ссылка действует 24 часа и появится здесь, когда архив будет готов.',
  'dataExport.reauthNote':
      'Подтверждение нужно, чтобы архив получили только вы.',
  'dataExport.request': 'Запросить выгрузку',
  'dataExport.requestAgain': 'Запросить снова',
  'dataExport.download': 'Скачать архив',
  'dataExport.cantOpen': 'Не удалось открыть ссылку.',
  'dataExport.status.title': 'Статус выгрузки',
  'dataExport.status.queued': 'В очереди',
  'dataExport.status.processing': 'Готовится',
  'dataExport.status.ready': 'Готово',
  'dataExport.status.failed': 'Ошибка',
  'dataExport.status.expired': 'Истекла',
  'dataExport.status.unknown': 'Статус уточняется',
  'dataExport.status.line.processing':
      'Собираем архив. Экран обновится сам; можно закрыть приложение — ссылка придёт на почту.',
  'dataExport.status.line.ready': 'Ссылка действует до {date}.',
  'dataExport.status.line.readyNoDate': 'Архив готов.',
  'dataExport.status.line.failed':
      'Не удалось собрать архив. Попробуйте ещё раз.',
  'dataExport.status.line.expired':
      'Срок ссылки истёк. Запросите выгрузку снова.',
  'notif.list.data_export_ready': 'Выгрузка данных готова',
  'notif.list.case_history_export_ready': 'PDF истории кейсов готов',
  // --- Коды ошибок (docs/06) ---
  'error.api.PAYMENTS_NOT_CONFIGURED':
      'Оплата временно недоступна. Попробуйте позже.',
  'error.api.SUBSCRIPTION_ALREADY_ACTIVE': 'Подписка уже активна.',
  'error.api.SUBSCRIPTION_TRIAL_UNAVAILABLE': 'Пробный период недоступен.',
  'error.api.SUBSCRIPTION_SETUP_INCOMPLETE':
      'Карта ещё не подтверждена. Попробуйте ещё раз.',
  'error.api.SUBSCRIPTION_NOT_FOUND': 'Подписка не найдена.',
  'error.api.PAYLOAD_TOO_LARGE': 'Файл или запрос слишком большой.',
  'error.api.CONTENT_BLOCKED':
      'Текст не прошёл проверку. Уберите запрещённые слова или ссылки и попробуйте снова.',
  // Owner changes 2026-09-29 (search field behind the magnifier).
  'search.open': 'Поиск',
  'person.client': 'Клиент',
  'client.memberSince': 'В LawBid с {date}',
  'client.profile.unavailable': 'Профиль недоступен',
  // OQ-028 blocks.
  'block.action': 'Заблокировать',
  'block.unblock': 'Разблокировать',
  'block.confirm.title': 'Заблокировать {name}?',
  'block.confirm.body':
      'Вы не сможете писать друг другу и подписываться, а также не будете находить друг друга в поиске. Разблокировать можно в любой момент.',
  'block.done': 'Пользователь заблокирован',
  'block.undone': 'Пользователь разблокирован',
  'block.blockedYou': 'Этот пользователь ограничил общение с вами',
  'block.byYou': 'Вы заблокировали этого пользователя',
  'settings.blocked': 'Заблокированные',
  'blocked.empty': 'Вы никого не заблокировали',
  'error.api.USER_BLOCKED': 'Общение с этим пользователем недоступно.',
  // OQ-030 firms / states in Edit.
  'profile.edit.firms.helper': 'До {max} фирм. Введите название и нажмите «+».',
  'profile.edit.firms.add': 'Добавить фирму',
  'profile.edit.addState': 'Добавить штат (лицензию)',
  'profile.nameMismatch.title': 'Синяя галочка скрыта',
  'profile.nameMismatch.body':
      'Имя отличается от имени в проверенных документах. Всё работает как обычно. Верните прежнее имя или подтвердите новое документом.',
  'profile.nameMismatch.action': 'Подтвердить новое имя',
  // OQ-031 case photos.
  'cases.photos.title': 'Фото',
  'cases.photos.privacy':
      'Необязательно, до 9 фото. Их увидит только адвокат, чей бид вы примете.',
  'cases.photos.add': 'Добавить фото',
  'cases.photos.remove': 'Убрать фото',
  'cases.photos.locked':
      'Фото к кейсу: {count}. Откроются после того, как клиент примет ваш бид.',
  // Owner 2026-09-30 post card and feed header.
  'post.readMore': 'Читать дальше',
  'post.public': 'Публично',
  'post.licensedAttorney': 'Лицензированный адвокат',
  'feed.topics.all': 'Все',
  'feed.topics.pick': 'Выберите темы',
  'feed.tagline': 'Юридическая помощь. Реальные люди.',
};

const file06En = <String, String>{
  // --- Subscription (docs/06 §1.7 items 1–2) ---
  'subscription.title': 'Subscription',
  'subscription.plan.badge': 'LawBid for attorneys',
  'subscription.plan.perMonth': 'per month',
  'subscription.plan.trialLine':
      '7 days free, then {price} per month. Cancel anytime.',
  'subscription.plan.noTrialLine': '{price} per month. Cancel anytime.',
  'subscription.plan.feature.bids': 'Unlimited bids on cases',
  'subscription.plan.feature.chat': 'Messaging with clients',
  'subscription.plan.feature.contacts':
      'Client contacts once a bid is accepted',
  'subscription.plan.feature.noFees': 'No commission on your fees',
  'subscription.cta.startTrial': 'Start free trial',
  'subscription.cta.subscribe': 'Subscribe',
  'subscription.cta.resubscribe': 'Subscribe again',
  'subscription.cta.verifyFirst':
      'The button unlocks once your verification is approved.',
  'subscription.cta.goVerify': 'Go to verification',
  'subscription.terms':
      'Billed automatically once a month. Cancel anytime under Manage.',
  'subscription.status.title': 'Current status',
  'subscription.status.trialing': 'Trial',
  'subscription.status.active': 'Active',
  'subscription.status.past_due': 'Payment failed',
  'subscription.status.canceled': 'Canceled',
  'subscription.status.expired': 'Expired',
  'subscription.status.incomplete': 'Confirming card',
  'subscription.status.unknown': 'Status pending',
  'subscription.line.trialEnds':
      'Trial until {date}, then the first charge of {price}.',
  'subscription.line.nextCharge': 'Next charge {price} on {date}.',
  'subscription.line.cancelScheduled':
      'Cancellation scheduled. Access continues until {date}.',
  'subscription.line.endedAt': 'Access ended on {date}.',
  'subscription.line.ended':
      'No access to bids and contacts. A new subscription starts without a trial.',
  'subscription.line.graceUntil':
      'Access continues until {date}. Update your card to keep it.',
  'subscription.line.graceOver':
      'Access is paused until a payment goes through. Update your card.',
  'subscription.line.incomplete':
      'Confirmation usually takes under a minute. This screen updates itself.',
  'subscription.action.manage': 'Manage',
  'subscription.action.cancel': 'Cancel',
  'subscription.action.updateCard': 'Update card',
  'subscription.action.refresh': 'Refresh',
  'subscription.action.payments': 'Payment history',
  'subscription.paymentFailed.title': 'Payment failed',
  'subscription.paymentFailed.body':
      'The last charge did not go through. Update your card to keep access to bids, chats and contacts.',
  'subscription.cancel.title': 'Cancel subscription?',
  'subscription.cancel.body':
      'You keep access until {date}. There will be no further charges.',
  'subscription.cancel.bodyNoDate':
      'You keep access until the end of the paid period. There will be no further charges.',
  'subscription.cancel.confirm': 'Cancel subscription',
  'subscription.cancel.done': 'Subscription canceled. Access until {date}.',
  'subscription.cancel.doneNoDate': 'Subscription canceled.',
  'subscription.chargeNow.title': 'Trial unavailable',
  'subscription.chargeNow.body':
      'No trial is available: {price} will be charged now. Continue?',
  'subscription.chargeNow.confirm': 'Pay {price}',
  'subscription.progress.starting': 'Preparing payment…',
  'subscription.progress.collectingCard': 'Waiting for the card…',
  'subscription.progress.confirming': 'Creating your subscription…',
  'subscription.progress.syncing': 'Confirming payment…',
  'subscription.done.trial': 'Your trial has started',
  'subscription.done.active': 'Subscription active',
  'subscription.done.pending':
      'Payment is being confirmed. The status updates within a minute.',
  'subscription.card.failed': 'Could not confirm the card: {reason}',
  'subscription.card.unavailable': 'Payments are not configured in this build.',
  'subscription.portal.cantOpen': 'Could not open the management page.',
  // --- Payment history (docs/06 §1.7 item 4) ---
  'payments.title': 'Payment history',
  'payments.empty.title': 'No payments yet',
  'payments.empty.message': 'Subscription charges will appear here.',
  'payments.status.pending': 'Pending',
  'payments.status.succeeded': 'Paid',
  'payments.status.failed': 'Failed',
  'payments.status.refunded': 'Refunded',
  'payments.status.unknown': 'Status pending',
  'payments.failureCode': 'Error code: {code}',
  // --- Paywall (docs/06 §1.7 item 3) ---
  'paywall.title': 'Subscription required',
  'paywall.bid.title': 'Bids come with a subscription',
  'paywall.bid.body':
      'Offering your terms to a client requires an active subscription or trial.',
  'paywall.chat.title': 'Client messaging comes with a subscription',
  'paywall.chat.body':
      'You can message a client with an active subscription or trial.',
  'paywall.contacts.title': 'Client contacts come with a subscription',
  'paywall.contacts.body':
      "The client's phone and e-mail open with an active subscription or trial.",
  'paywall.trialHint': '7 days free for verified attorneys.',
  'paywall.cta': 'Go to subscription',
  // --- Data export (docs/06 §5.2) ---
  'dataExport.title': 'A copy of your data',
  'dataExport.intro':
      'We will build a ZIP archive of JSON files and send you a link. It takes a few minutes.',
  'dataExport.includes.profile': 'Profile, consents and settings',
  'dataExport.includes.cases': 'Cases and bids',
  'dataExport.includes.social': 'Posts, comments and likes',
  'dataExport.includes.messages': 'Your chat messages',
  'dataExport.includes.devices': 'Devices and sign-ins',
  'dataExport.link':
      'The link works for 24 hours and goes to {email}. It also appears here.',
  'dataExport.linkNoEmail':
      'The link works for 24 hours and appears here once the archive is ready.',
  'dataExport.reauthNote':
      'Confirmation makes sure only you receive the archive.',
  'dataExport.request': 'Request export',
  'dataExport.requestAgain': 'Request again',
  'dataExport.download': 'Download archive',
  'dataExport.cantOpen': 'Could not open the link.',
  'dataExport.status.title': 'Export status',
  'dataExport.status.queued': 'Queued',
  'dataExport.status.processing': 'Preparing',
  'dataExport.status.ready': 'Ready',
  'dataExport.status.failed': 'Failed',
  'dataExport.status.expired': 'Expired',
  'dataExport.status.unknown': 'Status pending',
  'dataExport.status.line.processing':
      'Building the archive. This screen updates itself; you can close the app — the link also goes to your email.',
  'dataExport.status.line.ready': 'The link works until {date}.',
  'dataExport.status.line.readyNoDate': 'The archive is ready.',
  'dataExport.status.line.failed': 'The archive could not be built. Try again.',
  'dataExport.status.line.expired':
      'The link has expired. Request the export again.',
  'notif.list.data_export_ready': 'Your data export is ready',
  'notif.list.case_history_export_ready': 'Case history PDF is ready',
  // --- Error codes (docs/06) ---
  'error.api.PAYMENTS_NOT_CONFIGURED':
      'Payments are temporarily unavailable. Try again later.',
  'error.api.SUBSCRIPTION_ALREADY_ACTIVE':
      'The subscription is already active.',
  'error.api.SUBSCRIPTION_TRIAL_UNAVAILABLE': 'No trial is available.',
  'error.api.SUBSCRIPTION_SETUP_INCOMPLETE':
      'The card has not been confirmed yet. Try again.',
  'error.api.SUBSCRIPTION_NOT_FOUND': 'No subscription found.',
  'error.api.PAYLOAD_TOO_LARGE': 'The file or request is too large.',
  'error.api.CONTENT_BLOCKED':
      'The text did not pass review. Remove prohibited words or links and try again.',
  // Owner changes 2026-09-29 (search field behind the magnifier).
  'search.open': 'Search',
  'person.client': 'Client',
  'client.memberSince': 'On LawBid since {date}',
  'client.profile.unavailable': 'Profile unavailable',
  // OQ-028 blocks.
  'block.action': 'Block',
  'block.unblock': 'Unblock',
  'block.confirm.title': 'Block {name}?',
  'block.confirm.body':
      'You will not be able to message or follow each other, and you will not find each other in search. You can unblock at any time.',
  'block.done': 'User blocked',
  'block.undone': 'User unblocked',
  'block.blockedYou': 'This user has restricted contact with you',
  'block.byYou': 'You blocked this user',
  'settings.blocked': 'Blocked users',
  'blocked.empty': 'You have not blocked anyone',
  'error.api.USER_BLOCKED': 'You cannot interact with this user.',
  // OQ-030 firms / states in Edit.
  'profile.edit.firms.helper': 'Up to {max} firms. Type a name and tap "+".',
  'profile.edit.firms.add': 'Add firm',
  'profile.edit.addState': 'Add a state (license)',
  'profile.nameMismatch.title': 'Blue check hidden',
  'profile.nameMismatch.body':
      'Your name differs from the one on your verified documents. Everything keeps working. Change it back or confirm the new name with a document.',
  'profile.nameMismatch.action': 'Confirm new name',
  // OQ-031 case photos.
  'cases.photos.title': 'Photos',
  'cases.photos.privacy':
      'Optional, up to 9 photos. Only the attorney whose bid you accept will see them.',
  'cases.photos.add': 'Add photo',
  'cases.photos.remove': 'Remove photo',
  'cases.photos.locked':
      'Photos attached: {count}. They open once the client accepts your bid.',
  // Owner 2026-09-30 post card and feed header.
  'post.readMore': 'Read more',
  'post.public': 'Public',
  'post.licensedAttorney': 'Licensed Attorney',
  'feed.topics.all': 'All',
  'feed.topics.pick': 'Choose topics',
  'feed.tagline': 'Legal help. Real people.',
};
