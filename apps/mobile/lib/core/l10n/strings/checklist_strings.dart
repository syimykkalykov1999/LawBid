// ignore_for_file: lines_longer_than_80_chars
// Owner 2026-10-22 (systems checklist, mobile items 1–9): guest browsing,
// passkeys, reduce motion, link previews, the CCPA switch, the in-app review
// prompt. Every other language: apps/api/prisma/seed/translations_seed.xlsx
// (scripts/i18n-add.mjs).

const checklistRu = <String, String>{
  // Item 9: CCPA «Do Not Sell or Share» + the accessibility statement.
  'privacy.doNotSell': 'Не продавать и не передавать мои данные',
  'privacy.doNotSell.hint':
      'Закон Калифорнии (CCPA). LawBid не продаёт персональные данные; этот переключатель также запрещает передачу данных для рекламы.',
  'legal.doc.accessibility': 'Заявление о доступности',
  // Item 5: spoken names of icon-only buttons (VoiceOver / TalkBack).
  'a11y.mute': 'Выключить звук',
  'a11y.unmute': 'Включить звук',
  'a11y.less': 'Меньше',
  'a11y.more': 'Больше',
  'a11y.gridView': 'Сеткой',
  'a11y.listView': 'Списком',
  'a11y.rateStars': 'Оценка {count}',
  // Item 1: guest browsing (no account).
  'guest.signIn': 'Войти',
  'guest.bar.text': 'Войдите, чтобы писать, звонить и откликаться',
  'guest.gate.title': 'Нужен аккаунт',
  'guest.gate.message': 'Войдите или создайте аккаунт — это бесплатно.',
  'guest.welcome.browse': 'Посмотреть без входа',
  'guest.profile.signIn': 'Войдите, чтобы увидеть профиль целиком',
  'guest.error.signIn': 'Войдите, чтобы это увидеть.',
  'guest.error.later': 'Сейчас слишком много просмотров. Попробуйте чуть позже или войдите.',
  'call.updateApp': 'Обновите приложение, чтобы звонить и отвечать на звонки.',
  // Item 2: passkeys.
  'passkey.signIn': 'Войти по Face ID / отпечатку',
  'passkey.signIn.short': 'Face ID / отпечаток',
  'passkey.section': 'Ключи входа',
  'passkey.add': 'Добавить ключ',
  'passkey.added': 'Ключ добавлен',
  'passkey.added.on': 'Добавлен {date}',
  'passkey.lastUsed': 'Использован {date}',
  'passkey.empty': 'Ключей пока нет. Ключ входа хранится в Связке ключей iCloud или в Google-менеджере паролей.',
  'passkey.hint': 'Вход по Face ID, отпечатку или коду экрана — без пароля и SMS.',
  'passkey.remove.title': 'Удалить ключ?',
  'passkey.remove.body': 'Ключ «{name}» больше не откроет аккаунт.',
  'passkey.error.cancelled': 'Вход отменён',
  'passkey.error.noCredentials': 'На этом устройстве нет ключа LawBid',
  'passkey.error.unsupported': 'Ключи входа недоступны на этом устройстве',
  'passkey.error.generic': 'Не удалось войти по ключу',
  // Item 8: link previews in chats.
  'privacy.linkPreviews': 'Предпросмотр ссылок в чатах',
  'privacy.linkPreviews.hint':
      'Под ссылкой показывается карточка сайта. Данные берёт наш сервер, а не ваш телефон.',
  'chat.linkPreview.label': 'Ссылка',
  // Item 2: the API's passkey error codes (docs/runbooks/PASSKEYS.md).
  'error.api.PASSKEY_INVALID':
      'Ключ не принят. Попробуйте ещё раз или войдите по коду.',
  'error.api.PASSKEY_NOT_FOUND': 'Этого ключа больше нет в аккаунте.',
  'error.api.PASSKEY_LIMIT':
      'Не больше 10 ключей на аккаунт. Сначала удалите один.',
};

const checklistEn = <String, String>{
  'privacy.doNotSell': 'Do not sell or share my personal information',
  'privacy.doNotSell.hint':
      'California law (CCPA). LawBid does not sell personal data; this switch also opts you out of sharing for advertising.',
  'legal.doc.accessibility': 'Accessibility statement',
  'a11y.mute': 'Mute',
  'a11y.unmute': 'Unmute',
  'a11y.less': 'Less',
  'a11y.more': 'More',
  'a11y.gridView': 'Grid view',
  'a11y.listView': 'List view',
  'a11y.rateStars': 'Rate {count}',
  'guest.signIn': 'Sign in',
  'guest.bar.text': 'Sign in to message, call and respond',
  'guest.gate.title': 'Account needed',
  'guest.gate.message': 'Sign in or create an account — it is free.',
  'guest.welcome.browse': 'Browse without signing in',
  'guest.profile.signIn': 'Sign in to see the full profile',
  'guest.error.signIn': 'Sign in to see this.',
  'guest.error.later': 'Too many views right now. Try again a little later, or sign in.',
  'call.updateApp': 'Update the app to make and answer calls.',
  'passkey.signIn': 'Sign in with Face ID / fingerprint',
  'passkey.signIn.short': 'Face ID / fingerprint',
  'passkey.section': 'Sign-in keys',
  'passkey.add': 'Add a key',
  'passkey.added': 'Key added',
  'passkey.added.on': 'Added {date}',
  'passkey.lastUsed': 'Used {date}',
  'passkey.empty': 'No keys yet. A sign-in key lives in iCloud Keychain or Google Password Manager.',
  'passkey.hint': 'Sign in with Face ID, a fingerprint or your screen code — no password, no SMS.',
  'passkey.remove.title': 'Delete the key?',
  'passkey.remove.body': 'The key “{name}” will no longer open the account.',
  'passkey.error.cancelled': 'Sign-in cancelled',
  'passkey.error.noCredentials': 'No LawBid key on this device',
  'passkey.error.unsupported': 'Sign-in keys are not available on this device',
  'passkey.error.generic': 'Could not sign in with the key',
  'privacy.linkPreviews': 'Link previews in chats',
  'privacy.linkPreviews.hint':
      'A site card is shown under a link. Our server fetches it, not your phone.',
  'chat.linkPreview.label': 'Link',
  'error.api.PASSKEY_INVALID':
      'The key was not accepted. Try again or sign in with a code.',
  'error.api.PASSKEY_NOT_FOUND': 'This key is no longer on the account.',
  'error.api.PASSKEY_LIMIT':
      'No more than 10 keys per account. Remove one first.',
};
