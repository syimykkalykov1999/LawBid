// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-05: attorney trust levels (docs/ATTORNEY_TRUST.md) —
// compiled-in strings merged into StaticTranslatorRu/En. Levels: 0 only
// self-declared, 1 bar number matched the state registry, 2 identity
// confirmed (Stripe KYC name match or a firm link), 3 documents checked
// by staff.

const trustRu = <String, String>{
  // Level names (the chip) and one-line meanings.
  'trust.level.0': 'Заявлен',
  'trust.level.1': 'Реестр',
  'trust.level.2': 'Личность',
  'trust.level.3': 'Документы',
  'trust.level.0.desc':
      'Адвокат сам указал штат и номер лицензии под присягой. LawBid это ещё не проверил.',
  'trust.level.1.desc': 'Номер лицензии совпал с реестром адвокатов штата.',
  'trust.level.2.desc':
      'Личность подтверждена: проверка Stripe с совпадением имени или подтверждённая связь с фирмой.',
  'trust.level.3.desc':
      'Сотрудник LawBid проверил удостоверение адвоката, документ с фото и селфи.',
  'trust.chip.label': 'Уровень доверия: {level}',
  'trust.chip.hint': 'Нажмите, чтобы узнать, что проверено',
  'trust.levelOf': 'Уровень {level} из {max}',

  // The sheet / the public card.
  'trust.sheet.title': 'Уровень доверия',
  'trust.sheet.intro':
      'Что LawBid проверил об этом адвокате. Чем выше уровень, тем больше подтверждено независимо от его слов.',
  'trust.sheet.levels': 'Уровни',
  'trust.sheet.signals': 'Что проверено',
  'trust.sheet.registry': 'Проверьте сами в реестре штата',
  'trust.sheet.registry.hint':
      'Откройте реестр адвокатов штата и сравните имя и номер лицензии.',
  'trust.registry.open': 'Проверить в реестре',
  'trust.registry.state': 'Реестр: {state}',
  'trust.registry.noUrl': 'Ссылка на реестр штата {state} пока недоступна.',
  'trust.registry.cantOpen': 'Не удалось открыть ссылку.',
  'trust.signal.selfAttested': 'Заявление под присягой принято',
  'trust.signal.license.registry': 'Номер лицензии совпал с реестром штата',
  'trust.signal.license.staff': 'Лицензию подтвердил сотрудник LawBid',
  'trust.signal.license.no': 'Номер лицензии ещё не сверен с реестром',
  'trust.signal.identity.stripe':
      'Личность подтверждена через проверку Stripe (имя совпало)',
  'trust.signal.identity.documents':
      'Документы (удостоверение, фото, селфи) проверил сотрудник',
  'trust.signal.identity.firm': 'Подтверждена связь с юридической фирмой',
  'trust.signal.identity.no': 'Личность ещё не подтверждена',
  'trust.signal.name.mismatch':
      'Имя в платёжном аккаунте не совпадает с профилем',
  'trust.signal.name.match': 'Имя в платёжном аккаунте совпадает с профилем',
  'trust.signal.name.unknown': 'Имя в платёжном аккаунте ещё не сверено',
  // Payments inside LawBid = the client paying this attorney in the app
  // (and the attorney invoicing the client). Not the subscription.
  'trust.signal.payments.ok': 'Можно оплатить через LawBid',
  'trust.signal.payments.no': 'Оплатить через LawBid пока нельзя',
  'trust.signal.payments.ok.self': 'Клиенты могут платить вам через LawBid',
  'trust.signal.payments.no.self':
      'Клиенты пока не могут платить вам через LawBid',
  'trust.signal.bids.ok': 'Может откликаться на кейсы',
  'trust.signal.bids.no': 'Отклики и чат приостановлены',

  // Client pre-payment notice.
  'trust.payment.title': 'Перед оплатой',
  'trust.payment.ok.stripe':
      'Личность этого адвоката подтверждена через проверку Stripe: имя в платёжном аккаунте совпало с профилем.',
  'trust.payment.ok.documents':
      'Личность этого адвоката подтвердил сотрудник LawBid по документам.',
  'trust.payment.ok.firm':
      'Связь этого адвоката с юридической фирмой подтверждена.',
  'trust.payment.ok.generic': 'Личность этого адвоката подтверждена.',
  'trust.payment.blocked':
      'Оплатить работу этого адвоката через LawBid пока нельзя: его аккаунт ещё не подтверждён, LawBid не проверил его личность. Не переводите ему деньги напрямую, мимо приложения: такие платежи LawBid не проверяет.',
  'trust.payment.blocked.review':
      'Оплатить работу этого адвоката через LawBid сейчас нельзя: LawBid ещё не завершил проверку его аккаунта. Не переводите ему деньги напрямую, мимо приложения: такие платежи LawBid не проверяет.',

  // The same card when the attorney looks at their own profile.
  'trust.payment.self.title': 'Оплаты через LawBid',
  'trust.payment.self.blocked':
      'Оплаты внутри LawBid для вас пока не работают: ваш аккаунт ещё не подтверждён. Клиенты не могут оплатить вашу работу через приложение, а вы не можете выставить им счёт.',
  'trust.payment.self.paused':
      'Оплаты внутри LawBid для вас приостановлены: клиенты не могут оплатить вашу работу через приложение, а вы не можете выставить им счёт. Причина — в «Мой уровень доверия».',
  'trust.payment.self.missing': 'Осталось: {missing}.',
  'trust.payment.self.step.registry': 'сверка номера лицензии с реестром штата',
  'trust.payment.self.step.identity': 'подтверждение личности через Stripe',
  'trust.payment.self.step.documents': 'проверка документов сотрудником LawBid',
  'trust.payment.self.step.staff': 'решение сотрудника LawBid',
  'trust.payment.self.subscription':
      'С подпиской это не связано: она работает как обычно.',
  'trust.payment.self.subscription.bids':
      'С подпиской это не связано: подписка и отклики на кейсы работают как обычно.',
  'trust.payment.self.ok':
      'Клиенты могут оплачивать вашу работу через LawBid, а вы можете выставлять им счета.',
  'trust.payment.self.cta': 'Как подтвердить аккаунт',
  'trust.payment.unavailable': 'Не удалось загрузить уровень доверия.',

  // The attorney's own screen.
  'trust.me.title': 'Мой уровень доверия',
  'trust.me.hint': 'Что подтверждено и как поднять уровень',
  'trust.me.intro':
      'Клиенты видят ваш уровень на карточке и перед первой оплатой. Он растёт только от проверок, которые не зависят от ваших слов.',
  'trust.me.badge.on': 'Синяя галочка показывается',
  'trust.me.badge.off':
      'Синяя галочка и оплаты от клиентов через LawBid включатся, когда аккаунт будет подтверждён.',
  // Status card (what the attorney sees first).
  'trust.me.status.cleared': 'Проверка пройдена',
  'trust.me.status.cleared.body':
      'Галочка и приём оплаты через LawBid открыты.',
  'trust.me.status.needs_staff': 'На проверке у сотрудника',
  'trust.me.status.needs_staff.body':
      'Сотрудник LawBid смотрит ваш профиль. Что ждёт решения:',
  'trust.me.status.self_declared': 'Заявлен — что осталось',
  'trust.me.status.self_declared.body':
      'Выполните требования ниже — галочка и приём оплаты откроются автоматически.',
  'trust.me.status.suspended': 'Приостановлен',
  'trust.me.status.suspended.body':
      'Профиль приостановлен решением сотрудника. Отклики и приём оплаты закрыты; обратитесь в поддержку.',
  'trust.me.status.waiting.holds': 'снятие приостановки',
  'trust.me.status.waiting.firm_link': 'подтверждение связи с фирмой',
  'trust.me.status.waiting.documents': 'проверка документов',
  'trust.me.status.waiting.other': 'решение сотрудника',
  'trust.me.status.nothingMissing': 'Все включённые требования выполнены.',
  'trust.req.registry': 'Реестр штата',
  'trust.req.identity': 'Личность (Stripe)',
  'trust.req.documents': 'Документы',
  'trust.req.done': 'Выполнено',
  'trust.req.missing': 'Не выполнено',
  'trust.req.off': 'Не требуется',
  // Staff asked for documents.
  'trust.docs.title': 'Сотрудник запросил документы',
  'trust.docs.id_selfie': 'Нужны документ с фото (ID) и селфи с ним.',
  'trust.docs.bar_card': 'Нужно удостоверение адвоката (bar card).',
  'trust.docs.firm_letter':
      'Нужно письмо на бланке вашей фирмы о том, что вы в ней работаете.',
  'trust.docs.custom': 'Сотрудник оставил записку: {note}',
  'trust.docs.custom.noNote': 'Сотрудник запросил дополнительные документы.',
  'trust.docs.generic': 'Сотрудник запросил дополнительные документы.',
  'trust.docs.cta': 'Загрузить документы',
  'trust.me.gates': 'Что доступно',
  'trust.me.gate.bids': 'Отклики на кейсы',
  'trust.me.gate.payments': 'Оплаты от клиентов через LawBid',
  'trust.me.gate.ok': 'Доступно',
  'trust.me.gate.requirements': 'Не выполнено: {missing}',
  'trust.me.gate.hold': 'Приостановлено',
  'trust.me.gate.suspended': 'Профиль приостановлен',
  'trust.me.payoutDelay':
      'Выплаты Stripe приходят с задержкой {days} дн., пока уровень не вырастет.',
  'trust.me.hold.title': 'Приостановка',
  'trust.me.hold.bids': 'Отклики и чат приостановлены',
  'trust.me.hold.payments': 'Приём оплаты приостановлен',
  'trust.me.hold.both': 'Отклики и приём оплаты приостановлены',
  'trust.me.hold.reason.complaint':
      'Причина: жалоба клиента. Мы проверяем её; вы получите уведомление о решении.',
  'trust.me.hold.reason.name_mismatch':
      'Причина: имя в платёжном аккаунте Stripe не совпадает с профилем. Исправьте имя — приостановка снимется.',
  'trust.me.hold.reason.duplicate_claim':
      'Причина: тот же номер лицензии указал другой аккаунт. Мы разбираемся.',
  'trust.me.hold.reason.admin':
      'Причина: решение сотрудника LawBid. Напишите в поддержку, если это ошибка.',
  'trust.me.hold.reason.suspended':
      'Профиль приостановлен. Обратитесь в поддержку.',
  'trust.me.hold.reason.other': 'Подробности — в поддержке LawBid.',
  'trust.me.next': 'Что дальше',
  'trust.me.next.done': 'Максимальный уровень. Больше ничего не требуется.',
  'trust.next.hold_review':
      'Дождитесь проверки приостановки — пока она действует, уровень не растёт.',
  'trust.next.registry_check':
      'Сверка номера лицензии с реестром штата идёт автоматически. Проверьте, что номер и имя указаны так же, как в реестре.',
  'trust.next.stripe_kyc':
      'Пройдите проверку Stripe (подключение выплат) на своё имя — так подтверждается личность.',
  'trust.next.firm_link':
      'Платёжный аккаунт оформлен на фирму. Подтвердите связь с ней по рабочей почте на домене фирмы.',
  'trust.next.fix_name':
      'Имя в платёжном аккаунте Stripe не совпадает с профилем. Приведите их к одному написанию.',
  'trust.next.documents':
      'Загрузите удостоверение адвоката, документ с фото и селфи — сотрудник проверит их.',
  'trust.next.unknown': 'Следующий шаг станет известен после проверки.',
  'trust.next.documents.cta': 'К верификации',
  'trust.me.firm.title': 'Связь с фирмой',
  'trust.me.firm.none': 'Не требуется или не оформлена',
  'trust.me.firm.pending': 'Ожидает подтверждения',
  'trust.me.firm.confirmed': 'Подтверждена',
  'trust.me.firm.source.registry': 'по реестру штата',
  'trust.me.firm.source.email': 'по рабочей почте {domain}',
  'trust.me.firm.source.staff': 'сотрудником LawBid',
  'trust.me.firm.form.title': 'Подтвердить по рабочей почте',
  'trust.me.firm.form.hint':
      'Укажите свой адрес на домене фирмы (не бесплатная почта). Мы отправим на него 6-значный код.',
  'trust.me.firm.form.email': 'Рабочая почта',
  'trust.me.firm.form.emailHint': 'name@firm.com',
  'trust.me.firm.form.emailInvalid': 'Введите корректный адрес почты.',
  'trust.me.firm.form.send': 'Отправить код',
  'trust.me.firm.form.sent': 'Код отправлен на адрес в домене {domain}.',
  'trust.me.firm.form.code': 'Код из письма',
  'trust.me.firm.form.codeLabel': 'Поле для 6-значного кода',
  'trust.me.firm.form.confirm': 'Подтвердить',
  'trust.me.firm.form.changeEmail': 'Другой адрес',
  'trust.me.firm.form.success': 'Связь с фирмой {domain} подтверждена.',
  'trust.me.registry': 'Ваши реестры',

  // Notifications (`verification_update` with payload.kind = trust_*).
  'notif.verification.trust_level_up':
      'Ваш уровень доверия вырос. Откройте «Мой уровень доверия».',
  'notif.verification.trust_payments_paused':
      'Приём оплаты через LawBid приостановлен. Подробности — в «Мой уровень доверия».',
  'notif.verification.trust_payments_resumed':
      'Приём оплаты через LawBid возобновлён.',
  'notif.verification.trust_bids_paused':
      'Отклики на кейсы приостановлены. Подробности — в «Мой уровень доверия».',
  'notif.verification.trust_hold_lifted':
      'Приостановка снята: отклики и оплата снова доступны.',
  'notif.verification.trust_documents_requested':
      'Чтобы поднять уровень доверия, загрузите документы для проверки.',
  'notif.verification.trust_auto_suspended':
      'Профиль приостановлен из-за жалоб. Обратитесь в поддержку.',
  'notif.verification.trust_firm_link_required':
      'Подтвердите связь с фирмой по рабочей почте, чтобы поднять уровень доверия.',
  'notif.verification.trust_firm_link_confirmed':
      'Связь с фирмой подтверждена.',
  'notif.verification.trust_cleared':
      'Проверка пройдена: галочка и приём оплат открыты',
  'notif.verification.trust_requirements_changed':
      'Правила проверки изменились: для галочки и приёма оплат нужно пройти ещё шаги. Откройте «Мой уровень доверия».',

  // Errors when an attorney bids while blocked.
  'error.api.TRUST_LEVEL_REQUIRED':
      'Для этого действия не выполнены требования: {missing}. Откройте «Мой уровень доверия».',
  'error.api.TRUST_LEVEL_REQUIRED.plain':
      'Для этого действия не выполнены требования проверки. Откройте «Мой уровень доверия».',
  'error.api.BAR_NUMBER_BLOCKED':
      'Этот номер лицензии нельзя зарегистрировать: он был отклонён или заблокирован ранее. Обратитесь в поддержку.',
  'error.api.ATTORNEY_ON_HOLD':
      'Действие приостановлено: ваш профиль на проверке. Подробности — в «Мой уровень доверия».',
};

const trustEn = <String, String>{
  'trust.level.0': 'Self-declared',
  'trust.level.1': 'Registry',
  'trust.level.2': 'Identity',
  'trust.level.3': 'Documents',
  'trust.level.0.desc':
      'The attorney entered their state and bar number under a sworn statement. LawBid has not checked it yet.',
  'trust.level.1.desc': 'The bar number matched the state bar registry.',
  'trust.level.2.desc':
      'Identity confirmed: Stripe verification with a matching name, or a confirmed link to a law firm.',
  'trust.level.3.desc':
      'LawBid staff checked the bar card, a photo ID and a selfie.',
  'trust.chip.label': 'Trust level: {level}',
  'trust.chip.hint': 'Tap to see what was checked',
  'trust.levelOf': 'Level {level} of {max}',
  'trust.sheet.title': 'Trust level',
  'trust.sheet.intro':
      'What LawBid has checked about this attorney. The higher the level, the more is confirmed independently of their own word.',
  'trust.sheet.levels': 'Levels',
  'trust.sheet.signals': 'What was checked',
  'trust.sheet.registry': 'Check the state registry yourself',
  'trust.sheet.registry.hint':
      'Open the state bar registry and compare the name and bar number.',
  'trust.registry.open': 'Check the registry',
  'trust.registry.state': 'Registry: {state}',
  'trust.registry.noUrl': 'No registry link for {state} yet.',
  'trust.registry.cantOpen': 'Could not open the link.',
  'trust.signal.selfAttested': 'Sworn statement accepted',
  'trust.signal.license.registry': 'Bar number matched the state registry',
  'trust.signal.license.staff': 'License confirmed by LawBid staff',
  'trust.signal.license.no': 'Bar number not yet checked against the registry',
  'trust.signal.identity.stripe':
      'Identity confirmed through Stripe verification (name matched)',
  'trust.signal.identity.documents':
      'Documents (bar card, photo ID, selfie) checked by staff',
  'trust.signal.identity.firm': 'Link to a law firm confirmed',
  'trust.signal.identity.no': 'Identity not confirmed yet',
  'trust.signal.name.mismatch':
      'Name on the payout account does not match the profile',
  'trust.signal.name.match': 'Name on the payout account matches the profile',
  'trust.signal.name.unknown': 'Name on the payout account not checked yet',
  'trust.signal.payments.ok': 'Can be paid through LawBid',
  'trust.signal.payments.no': "Can't be paid through LawBid yet",
  'trust.signal.payments.ok.self': 'Clients can pay you through LawBid',
  'trust.signal.payments.no.self': "Clients can't pay you through LawBid yet",
  'trust.signal.bids.ok': 'Can bid on cases',
  'trust.signal.bids.no': 'Bids and chat are paused',
  'trust.payment.title': 'Before you pay',
  'trust.payment.ok.stripe':
      "This attorney's identity was confirmed through Stripe verification: the name on the payout account matched the profile.",
  'trust.payment.ok.documents':
      "This attorney's identity was confirmed by LawBid staff from documents.",
  'trust.payment.ok.firm':
      "This attorney's link to a law firm has been confirmed.",
  'trust.payment.ok.generic': "This attorney's identity has been confirmed.",
  'trust.payment.blocked':
      "You can't pay this attorney through LawBid yet: their account is not confirmed, LawBid has not checked their identity. Don't send them money directly, outside the app: LawBid does not check such payments.",
  'trust.payment.blocked.review':
      "You can't pay this attorney through LawBid right now: LawBid has not finished checking their account. Don't send them money directly, outside the app: LawBid does not check such payments.",
  'trust.payment.self.title': 'Payments through LawBid',
  'trust.payment.self.blocked':
      "Payments inside LawBid don't work for you yet: your account is not confirmed. Clients can't pay you through the app, and you can't send them invoices.",
  'trust.payment.self.paused':
      'Payments inside LawBid are paused for you: clients cannot pay you through the app, and you cannot send them invoices. The reason is in "My trust level".',
  'trust.payment.self.missing': 'Still needed: {missing}.',
  'trust.payment.self.step.registry':
      'bar number check against the state registry',
  'trust.payment.self.step.identity': 'identity check through Stripe',
  'trust.payment.self.step.documents': 'document review by LawBid staff',
  'trust.payment.self.step.staff': 'a decision by LawBid staff',
  'trust.payment.self.subscription':
      'This has nothing to do with your subscription: it works as usual.',
  'trust.payment.self.subscription.bids':
      'This has nothing to do with your subscription: your subscription and bidding on cases work as usual.',
  'trust.payment.self.ok':
      'Clients can pay you through LawBid, and you can send them invoices.',
  'trust.payment.self.cta': 'How to confirm my account',
  'trust.payment.unavailable': 'Could not load the trust level.',
  'trust.me.title': 'My trust level',
  'trust.me.hint': 'What is confirmed and how to raise the level',
  'trust.me.intro':
      'Clients see your level on your card and before their first payment. It only grows from checks that do not depend on your word.',
  'trust.me.badge.on': 'The blue check is shown',
  'trust.me.badge.off':
      'The blue check and client payments through LawBid turn on once your account is confirmed.',
  'trust.me.status.cleared': 'Check passed',
  'trust.me.status.cleared.body':
      'Your badge and payments through LawBid are open.',
  'trust.me.status.needs_staff': 'Under staff review',
  'trust.me.status.needs_staff.body':
      'LawBid staff are looking at your profile. Waiting for a decision:',
  'trust.me.status.self_declared': "Self-declared — what's left",
  'trust.me.status.self_declared.body':
      'Meet the requirements below — the badge and payments open automatically.',
  'trust.me.status.suspended': 'Suspended',
  'trust.me.status.suspended.body':
      'Your profile was suspended by staff. Bids and payments are closed; contact support.',
  'trust.me.status.waiting.holds': 'lifting the hold',
  'trust.me.status.waiting.firm_link': 'firm link confirmation',
  'trust.me.status.waiting.documents': 'document review',
  'trust.me.status.waiting.other': 'a staff decision',
  'trust.me.status.nothingMissing': 'Every enabled requirement is met.',
  'trust.req.registry': 'State registry',
  'trust.req.identity': 'Identity (Stripe)',
  'trust.req.documents': 'Documents',
  'trust.req.done': 'Done',
  'trust.req.missing': 'Not done',
  'trust.req.off': 'Not required',
  'trust.docs.title': 'Staff requested documents',
  'trust.docs.id_selfie': 'A photo ID and a selfie holding it are needed.',
  'trust.docs.bar_card': 'Your bar card is needed.',
  'trust.docs.firm_letter':
      "A letter on your firm's letterhead confirming you work there is needed.",
  'trust.docs.custom': 'Note from staff: {note}',
  'trust.docs.custom.noNote': 'Staff asked for additional documents.',
  'trust.docs.generic': 'Staff asked for additional documents.',
  'trust.docs.cta': 'Upload documents',
  'trust.me.gates': 'What you can do',
  'trust.me.gate.bids': 'Bidding on cases',
  'trust.me.gate.payments': 'Client payments through LawBid',
  'trust.me.gate.ok': 'Available',
  'trust.me.gate.requirements': 'Not met: {missing}',
  'trust.me.gate.hold': 'Paused',
  'trust.me.gate.suspended': 'Profile suspended',
  'trust.me.payoutDelay':
      'Stripe payouts arrive with a {days}-day delay until your level grows.',
  'trust.me.hold.title': 'On hold',
  'trust.me.hold.bids': 'Bids and chat are paused',
  'trust.me.hold.payments': 'Receiving payments is paused',
  'trust.me.hold.both': 'Bids and payments are paused',
  'trust.me.hold.reason.complaint':
      'Reason: a client complaint. We are reviewing it; you will be notified of the decision.',
  'trust.me.hold.reason.name_mismatch':
      'Reason: the name on your Stripe payout account does not match your profile. Fix the name and the hold is lifted.',
  'trust.me.hold.reason.duplicate_claim':
      'Reason: another account claimed the same bar number. We are looking into it.',
  'trust.me.hold.reason.admin':
      'Reason: a LawBid staff decision. Contact support if this is a mistake.',
  'trust.me.hold.reason.suspended':
      'Your profile is suspended. Contact support.',
  'trust.me.hold.reason.other': 'Details from LawBid support.',
  'trust.me.next': "What's next",
  'trust.me.next.done': 'Top level reached. Nothing more is needed.',
  'trust.next.hold_review':
      'Wait for the hold review — the level does not grow while a hold is active.',
  'trust.next.registry_check':
      'The bar number is checked against the state registry automatically. Make sure the number and name are entered exactly as in the registry.',
  'trust.next.stripe_kyc':
      'Complete Stripe verification (payout setup) in your own name — this confirms your identity.',
  'trust.next.firm_link':
      "The payout account belongs to a firm. Confirm your link to it with a work e-mail on the firm's domain.",
  'trust.next.fix_name':
      'The name on your Stripe payout account does not match your profile. Make them match.',
  'trust.next.documents':
      'Upload your bar card, a photo ID and a selfie — staff will check them.',
  'trust.next.unknown': 'The next step will be known after review.',
  'trust.next.documents.cta': 'Go to verification',
  'trust.me.firm.title': 'Firm link',
  'trust.me.firm.none': 'Not needed or not set up',
  'trust.me.firm.pending': 'Awaiting confirmation',
  'trust.me.firm.confirmed': 'Confirmed',
  'trust.me.firm.source.registry': 'by the state registry',
  'trust.me.firm.source.email': 'by work e-mail at {domain}',
  'trust.me.firm.source.staff': 'by LawBid staff',
  'trust.me.firm.form.title': 'Confirm with your work e-mail',
  'trust.me.firm.form.hint':
      "Enter your address on the firm's domain (not a free mailbox). We will send a 6-digit code to it.",
  'trust.me.firm.form.email': 'Work e-mail',
  'trust.me.firm.form.emailHint': 'name@firm.com',
  'trust.me.firm.form.emailInvalid': 'Enter a valid e-mail address.',
  'trust.me.firm.form.send': 'Send code',
  'trust.me.firm.form.sent': 'Code sent to your address at {domain}.',
  'trust.me.firm.form.code': 'Code from the e-mail',
  'trust.me.firm.form.codeLabel': '6-digit code field',
  'trust.me.firm.form.confirm': 'Confirm',
  'trust.me.firm.form.changeEmail': 'Use another address',
  'trust.me.firm.form.success': 'Link to {domain} confirmed.',
  'trust.me.registry': 'Your registries',
  'notif.verification.trust_level_up':
      'Your trust level went up. Open "My trust level".',
  'notif.verification.trust_payments_paused':
      'Payments through LawBid are paused. Details in "My trust level".',
  'notif.verification.trust_payments_resumed':
      'Payments through LawBid have resumed.',
  'notif.verification.trust_bids_paused':
      'Bidding on cases is paused. Details in "My trust level".',
  'notif.verification.trust_hold_lifted':
      'The hold is lifted: bids and payments are available again.',
  'notif.verification.trust_documents_requested':
      'To raise your trust level, upload your documents for review.',
  'notif.verification.trust_auto_suspended':
      'Your profile was suspended because of complaints. Contact support.',
  'notif.verification.trust_firm_link_required':
      'Confirm your link to the firm with a work e-mail to raise your trust level.',
  'notif.verification.trust_firm_link_confirmed': 'Firm link confirmed.',
  'notif.verification.trust_cleared':
      'Check passed: your badge and payments are open',
  'notif.verification.trust_requirements_changed':
      'The verification rules changed: a few more steps are needed for your badge and payments. Open "My trust level".',
  'error.api.TRUST_LEVEL_REQUIRED':
      'Requirements not met for this action: {missing}. Open "My trust level".',
  'error.api.TRUST_LEVEL_REQUIRED.plain':
      'The verification requirements for this action are not met. Open "My trust level".',
  'error.api.BAR_NUMBER_BLOCKED':
      'This license number cannot be registered: it was rejected or blocked before. Please contact support.',
  'error.api.ATTORNEY_ON_HOLD':
      'This action is paused: your profile is under review. Details in "My trust level".',
};
