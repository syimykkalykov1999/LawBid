// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-05: demo mode («Продвижение») for partners and bloggers,
// plus the referral install-referrer / ask-for-code prompts — compiled-in
// strings merged into StaticTranslatorRu/En (see static_translator.dart).

const demoRu = <String, String>{
  // Settings → Partner program → «Демо-режим» section.
  'demo.section.title': 'Демо-режим',
  'demo.section.hint':
      'Тестовые аккаунты для записи видео: данные ненастоящие и удаляются сами.',
  'demo.accounts.count': '{count} из {max} аккаунтов',
  'demo.accounts.ttl': 'Удаляются через {days} дн. без активности',
  'demo.accounts.empty': 'Демо-аккаунтов пока нет',
  'demo.create': 'Создать демо-аккаунт',
  'demo.create.title': 'Кем войти в демо?',
  'demo.create.hint': 'Аккаунт создастся и откроется сразу.',
  'demo.role.client': 'Клиент',
  'demo.role.attorney': 'Адвокат',
  'demo.role.assistant': 'Помощник',
  'demo.role.client.hint': 'Публикует кейсы и выбирает адвоката',
  'demo.role.attorney.hint': 'Проверенный, с активной подпиской',
  'demo.role.assistant.hint': 'Работает в команде демо-адвоката',
  'demo.enter': 'Войти',
  'demo.delete': 'Удалить',
  'demo.delete.confirm.title': 'Удалить демо-аккаунт?',
  'demo.delete.confirm.message':
      '«{name}» и все его данные будут удалены безвозвратно.',
  'demo.deleted': 'Демо-аккаунт удалён',
  'demo.limit': 'Лимит достигнут — удалите один аккаунт, чтобы создать новый.',
  'demo.lastSeen': 'Был в сети {date}',
  'demo.lastSeen.never': 'Ещё не открывали',
  'demo.expires': 'до {date}',
  'demo.entering': 'Открываем демо-аккаунт…',
  // Floating banner in the main shell.
  'demo.banner': 'Демо-режим · данные ненастоящие',
  'demo.banner.hide': 'Скрыть',
  'demo.banner.show': 'Показать плашку',
  'demo.banner.exit': 'Выйти',
  // Settings top card while in demo.
  'demo.settings.title': 'Вы в демо-аккаунте',
  'demo.settings.body':
      'Всё, что здесь происходит, ненастоящее и будет удалено.',
  'demo.exit': 'Выйти из демо',
  'demo.switch': 'Сменить демо-аккаунт',
  'demo.exited': 'Вы вышли из демо-режима',
  'demo.exited.signedOut': 'Демо завершено. Войдите в свой аккаунт.',
  // Welcome screen: blogger with a code from the admin.
  'demo.code.entry': 'У меня есть демо-код',
  'demo.code.title': 'Вход по демо-коду',
  'demo.code.body':
      'Введите код из 8 символов, который вам выдала команда LawBid.',
  'demo.code.field': 'Демо-код',
  'demo.code.submit': 'Войти',
  // Referral: install referrer and the one-time "have a code?" sheet.
  'referral.autoApplied': 'Код приглашения применён',
  'referral.askCode.title': 'Есть код приглашения?',
  'referral.askCode.body':
      'Если вас пригласил друг или партнёр LawBid, введите его код — бонус получите оба.',
  'referral.askCode.field': 'Код приглашения',
  'referral.askCode.apply': 'Применить',
  'referral.askCode.skip': 'Пропустить',
  // Error codes (DEMO_*).
  'error.api.DEMO_DISABLED': 'Демо-режим недоступен.',
  'error.api.DEMO_LIMIT_REACHED':
      'Достигнут лимит демо-аккаунтов. Удалите один, чтобы создать новый.',
  'error.api.DEMO_UNAVAILABLE': 'Демо временно недоступно. Попробуйте позже.',
  'error.api.DEMO_CODE_INVALID': 'Демо-код не найден или истёк.',
};

const demoEn = <String, String>{
  'demo.section.title': 'Demo mode',
  'demo.section.hint':
      'Test accounts for recording videos: the data is not real and is deleted automatically.',
  'demo.accounts.count': '{count} of {max} accounts',
  'demo.accounts.ttl': 'Deleted after {days} days without activity',
  'demo.accounts.empty': 'No demo accounts yet',
  'demo.create': 'Create demo account',
  'demo.create.title': 'Who are you in the demo?',
  'demo.create.hint': 'The account is created and opened right away.',
  'demo.role.client': 'Client',
  'demo.role.attorney': 'Attorney',
  'demo.role.assistant': 'Assistant',
  'demo.role.client.hint': 'Posts cases and picks an attorney',
  'demo.role.attorney.hint': 'Verified, with an active subscription',
  'demo.role.assistant.hint': "Works in a demo attorney's team",
  'demo.enter': 'Enter',
  'demo.delete': 'Delete',
  'demo.delete.confirm.title': 'Delete demo account?',
  'demo.delete.confirm.message':
      '"{name}" and all of its data will be deleted for good.',
  'demo.deleted': 'Demo account deleted',
  'demo.limit': 'Limit reached — delete an account to create a new one.',
  'demo.lastSeen': 'Last active {date}',
  'demo.lastSeen.never': 'Not opened yet',
  'demo.expires': 'until {date}',
  'demo.entering': 'Opening the demo account…',
  'demo.banner': 'Demo mode · data is not real',
  'demo.banner.hide': 'Hide',
  'demo.banner.show': 'Show banner',
  'demo.banner.exit': 'Exit',
  'demo.settings.title': 'You are in a demo account',
  'demo.settings.body': 'Nothing here is real, and it will be deleted.',
  'demo.exit': 'Exit demo',
  'demo.switch': 'Switch demo account',
  'demo.exited': 'You left demo mode',
  'demo.exited.signedOut': 'Demo finished. Sign in to your account.',
  'demo.code.entry': 'I have a demo code',
  'demo.code.title': 'Sign in with a demo code',
  'demo.code.body': 'Enter the 8-character code the LawBid team gave you.',
  'demo.code.field': 'Demo code',
  'demo.code.submit': 'Enter',
  'referral.autoApplied': 'Invite code applied',
  'referral.askCode.title': 'Have an invite code?',
  'referral.askCode.body':
      'If a friend or a LawBid partner invited you, enter their code — you both get the bonus.',
  'referral.askCode.field': 'Invite code',
  'referral.askCode.apply': 'Apply',
  'referral.askCode.skip': 'Skip',
  'error.api.DEMO_DISABLED': 'Demo mode is not available.',
  'error.api.DEMO_LIMIT_REACHED':
      'Demo account limit reached. Delete one to create another.',
  'error.api.DEMO_UNAVAILABLE':
      'Demo is temporarily unavailable. Try again later.',
  'error.api.DEMO_CODE_INVALID': 'This demo code is unknown or has expired.',
};
