// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-04: the attorney's linear onboarding (licence → practices →
// subscription offer), bids in any state, and the client-side notes —
// compiled-in strings merged into StaticTranslatorRu/En.

const attorneySetupRu = <String, String>{
  'onboarding.attorney.license.title': 'Подтвердите лицензию',
  'onboarding.attorney.license.subtitle':
      'Штат и номер лицензии и одна галочка, что данные верны. Подтверждение сразу.',
  'onboarding.attorney.license.cta': 'Подтвердить лицензию',
  'onboarding.attorney.license.resume': 'Продолжить подтверждение',
  'onboarding.attorney.license.fix': 'Открыть статус проверки',
  'onboarding.attorney.license.pending.title': 'Лицензия на проверке',
  'onboarding.attorney.license.pending.body':
      'Мы сообщим, как только проверим. Пока можно смотреть кейсы и ленту.',
  'onboarding.attorney.practices.title': 'Ваши практики',
  'onboarding.attorney.practices.subtitle':
      'По ним мы подбираем кейсы и уведомления. Изменить можно в любой момент в профиле.',
  'onboarding.attorney.practices.save': 'Сохранить и продолжить',
  'onboarding.attorney.practices.pickOne': 'Выберите хотя бы одну практику',
  'subscription.offer.trial.title': '{days} бесплатно',
  'subscription.offer.trial.body':
      'Отклики на кейсы и чаты с клиентами сразу. Карта нужна при старте; первое списание {price} в месяц через {days}, если не отмените.',
  'subscription.offer.trial.cta': 'Начать {days} бесплатно',
  'subscription.trial.days.one': '{count} день',
  'subscription.trial.days.few': '{count} дня',
  'subscription.trial.days.many': '{count} дней',
  'subscription.trial.days.other': '{count} дня',
  'subscription.offer.paid.title': 'Оформите подписку',
  'subscription.offer.paid.body':
      'Пробный период закончился. Подписка {price} в месяц открывает отклики и чаты с клиентами.',
  'subscription.offer.paid.cta': 'Оформить подписку',
  'subscription.offer.later': 'Позже',
  'subscription.offer.allPlans': 'Все тарифы и помощники',
  'subscription.offer.benefit.bids': 'Отклики на кейсы в любом штате',
  'subscription.offer.benefit.chats':
      'Чаты с клиентами и контакты после принятия',
  'subscription.offer.benefit.cancel': 'Отмена в любой момент',
  'subscription.offer.browseNote':
      'Без подписки можно смотреть все кейсы и ленту.',
  'subscription.offer.verifyFirst':
      'Сначала подтвердите лицензию, после этого откроется пробный период.',
  'cases.outsideStates.attorney':
      'У вас нет лицензии в штате этого кейса. Отклик отправить можно: клиент увидит, в каких штатах вы лицензированы.',
  'cases.outsideStates.client':
      'Адвокат лицензирован в: {states}. Штата этого кейса среди них нет. Уточните, как он будет вести дело.',
  'cases.outsideStates.clientNoList':
      'У адвоката нет лицензии в штате этого кейса. Уточните, как он будет вести дело.',
  'cases.accept.mismatchIntro': 'Обратите внимание:',
};

const attorneySetupEn = <String, String>{
  'onboarding.attorney.license.title': 'Confirm your license',
  'onboarding.attorney.license.subtitle':
      'Your state and bar number, plus one checkbox that the details are true. Approved right away.',
  'onboarding.attorney.license.cta': 'Confirm license',
  'onboarding.attorney.license.resume': 'Continue confirmation',
  'onboarding.attorney.license.fix': 'Open verification status',
  'onboarding.attorney.license.pending.title': 'License under review',
  'onboarding.attorney.license.pending.body':
      "We'll let you know once it's checked. Meanwhile you can browse cases and the feed.",
  'onboarding.attorney.practices.title': 'Your practice areas',
  'onboarding.attorney.practices.subtitle':
      'We match cases and alerts to them. You can change them any time in your profile.',
  'onboarding.attorney.practices.save': 'Save and continue',
  'onboarding.attorney.practices.pickOne': 'Pick at least one practice area',
  'subscription.offer.trial.title': '{days} free',
  'subscription.offer.trial.body':
      'Bid on cases and chat with clients right away. A card is needed to start; the first charge of {price} a month comes in {days} unless you cancel.',
  'subscription.offer.trial.cta': 'Start {days} free',
  'subscription.trial.days.one': '{count} day',
  'subscription.trial.days.other': '{count} days',
  'subscription.offer.paid.title': 'Subscribe to continue',
  'subscription.offer.paid.body':
      'Your free trial has ended. A {price} a month subscription unlocks bids and client chats.',
  'subscription.offer.paid.cta': 'Subscribe',
  'subscription.offer.later': 'Later',
  'subscription.offer.allPlans': 'All plans and assistant seats',
  'subscription.offer.benefit.bids': 'Bids on cases in any state',
  'subscription.offer.benefit.chats':
      'Client chats, and contacts after acceptance',
  'subscription.offer.benefit.cancel': 'Cancel any time',
  'subscription.offer.browseNote':
      'Without a subscription you can still browse every case and the feed.',
  'subscription.offer.verifyFirst':
      'Confirm your license first; the free trial opens right after.',
  'cases.outsideStates.attorney':
      "You have no license in this case's state. You can still bid: the client will see the states you're licensed in.",
  'cases.outsideStates.client':
      "The attorney is licensed in: {states}. This case's state isn't one of them. Ask how they'll handle it.",
  'cases.outsideStates.clientNoList':
      "The attorney has no license in this case's state. Ask how they'll handle it.",
  'cases.accept.mismatchIntro': 'Please note:',
};
